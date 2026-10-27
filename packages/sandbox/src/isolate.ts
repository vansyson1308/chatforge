import {
  getQuickJS,
  type QuickJSContext,
  type QuickJSRuntime,
} from "quickjs-emscripten";

export interface SandboxError {
  modId: string;
  message: string;
  stack?: string;
}
export class ModExecutionError extends Error {
  constructor(public readonly details: SandboxError) {
    super(`${details.modId}: ${details.message}`);
    this.name = "ModExecutionError";
  }
}

/** Low-level isolated execution primitive. Host bindings and lifecycle are layered above it. */
export class ModIsolate {
  private deadline = 0;
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
    const quickjs = await getQuickJS();
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
    runtime.setInterruptHandler(() => performance.now() >= isolate.deadline);
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
    this.deadline = performance.now() + budgetMs;
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
      return this.context.dump(result.value) as unknown;
    } finally {
      result.value.dispose();
    }
  }
  dispose(): void {
    this.context.dispose();
    this.runtime.dispose();
  }
}
