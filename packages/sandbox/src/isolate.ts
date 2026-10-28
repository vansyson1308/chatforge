import {
  getQuickJS,
  getQuickJSSync,
  type QuickJSContext,
  type QuickJSRuntime,
} from "quickjs-emscripten";

export interface SandboxError {
  modId: string;
  message: string;
  stack?: string;
}
/** Current simulation thread CPU time, excluding time descheduled by the OS. */
export function threadCpuMs(): number {
  const usage = process.threadCpuUsage();
  return (usage.user + usage.system) / 1000;
}
export class ModExecutionError extends Error {
  constructor(public readonly details: SandboxError) {
    super(`${details.modId}: ${details.message}`);
    this.name = "ModExecutionError";
  }
}

/** Loads the QuickJS WebAssembly module once; synchronous isolate creation needs it. */
export async function initQuickJS(): Promise<void> {
  await getQuickJS();
}

/** Low-level isolated execution primitive. Host bindings and lifecycle are layered above it. */
export class ModIsolate {
  private deadline = 0;
  private wallDeadline = 0;
  private constructor(
    readonly id: string,
    private runtime: QuickJSRuntime,
    private context: QuickJSContext,
    readonly budgetMs: number,
  ) {}

  static async create(
    id: string,
    options: {
      memoryBytes?: number;
      stackBytes?: number;
      budgetMs?: number;
    } = {},
  ): Promise<ModIsolate> {
    await getQuickJS();
    return ModIsolate.createSync(id, options);
  }
  static createSync(
    id: string,
    options: {
      memoryBytes?: number;
      stackBytes?: number;
      budgetMs?: number;
    } = {},
  ): ModIsolate {
    const quickjs = getQuickJSSync();
    const runtime = quickjs.newRuntime();
    runtime.setMemoryLimit(options.memoryBytes ?? 4 * 1024 * 1024);
    runtime.setMaxStackSize(options.stackBytes ?? 256 * 1024);
    const context = runtime.newContext();
    const isolate = new ModIsolate(
      id,
      runtime,
      context,
      options.budgetMs ?? 10,
    );
    runtime.setInterruptHandler(
      () =>
        threadCpuMs() >= isolate.deadline ||
        performance.now() >= isolate.wallDeadline,
    );
    try {
      isolate.evaluate(
        `
        'use strict';
        globalThis.Date = undefined;
        Math.random = undefined;
        globalThis.eval = undefined;
        const functionPrototypes = [Function.prototype, Object.getPrototypeOf(async function(){}), Object.getPrototypeOf(function*(){}), Object.getPrototypeOf(async function*(){})];
        for (const prototype of functionPrototypes) Object.defineProperty(prototype, 'constructor', { value: undefined, writable: false, configurable: false });
        globalThis.Function = undefined;
      `,
        1000,
      );
      return isolate;
    } catch (error) {
      context.dispose();
      runtime.dispose();
      throw error;
    }
  }
  bindJson(name: string, handler: (input: unknown) => unknown): void {
    const fn = this.context.newFunction(name, (arg) => {
      try {
        const raw = this.context.getString(arg);
        if (raw.length > 65536) throw new Error("Host request is too large");
        const result = handler(JSON.parse(raw) as unknown);
        const json = JSON.stringify({ ok: true, result: result ?? null });
        if (json.length > 65536) throw new Error("Host response is too large");
        return this.context.newString(json);
      } catch (error) {
        return this.context.newString(
          JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    });
    try {
      this.context.setProp(this.context.global, name, fn);
    } finally {
      fn.dispose();
    }
  }
  evaluate(source: string, budgetMs = this.budgetMs, module = false): unknown {
    this.deadline = threadCpuMs() + budgetMs;
    this.wallDeadline = performance.now() + Math.max(250, budgetMs * 10);
    const result = this.context.evalCode(
      source,
      `${this.id}.js`,
      module ? { type: "module" } : undefined,
    );
    if (result.error) {
      const error: unknown = this.context.dump(result.error);
      result.error.dispose();
      const details =
        error && typeof error === "object"
          ? (error as Record<string, unknown>)
          : {};
      throw new ModExecutionError({
        modId: this.id,
        message:
          typeof details.message === "string" ? details.message : String(error),
        ...(typeof details.stack === "string" ? { stack: details.stack } : {}),
      });
    }
    try {
      if (this.runtime.hasPendingJob())
        throw new ModExecutionError({
          modId: this.id,
          message: "Async jobs and dynamic import are disabled",
        });
      return this.context.dump(result.value) as unknown;
    } finally {
      if (result.value.alive) result.value.dispose();
    }
  }
  dispose(): void {
    this.context.dispose();
    this.runtime.dispose();
  }
}
