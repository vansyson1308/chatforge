import { beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { World } from "../../../packages/engine/src/index.js";
import { goodMod, testCards } from "./forge-fixtures.js";
const mock = vi.hoisted(() => ({
  options: {} as Record<string, unknown>,
  threadOptions: {} as Record<string, unknown>,
  calls: 0,
  starts: 0,
  resumes: 0,
  tamper: false,
  run: undefined as undefined | ((prompt: string) => Promise<void>),
}));
vi.mock("@openai/codex-sdk", () => ({
  Codex: class {
    constructor(options: Record<string, unknown>) {
      mock.options = options;
    }
    startThread(options: Record<string, unknown>) {
      mock.starts++;
      mock.threadOptions = options;
      return this.thread();
    }
    resumeThread(_id: string, options: Record<string, unknown>) {
      mock.resumes++;
      mock.threadOptions = options;
      return this.thread();
    }
    private thread() {
      return {
        runStreamed: async (prompt: string) => {
          mock.calls++;
          await mock.run!(prompt);
          return {
            events: (async function* () {
              yield { type: "thread.started", thread_id: "fake-codex-thread" };
              yield {
                type: "item.completed",
                item: {
                  type: "command_execution",
                  command: "node forge-test.mjs",
                  status: "completed",
                  exit_code: 0,
                  aggregated_output: "SECRET_DO_NOT_BROADCAST",
                },
              };
              yield {
                type: "item.completed",
                item: {
                  type: "agent_message",
                  text: "SECRET_DO_NOT_BROADCAST",
                },
              };
              yield {
                type: "turn.completed",
                usage: { input_tokens: 10, output_tokens: 10 },
              };
            })(),
          };
        },
      };
    }
  },
}));
import { WorkspaceBuilder } from "./builder.js";
beforeEach(() => {
  mock.calls = 0;
  mock.starts = 0;
  mock.resumes = 0;
  mock.tamper = false;
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "chatforge-builder-"));
  for (const dir of [
    "docs",
    "packages/mod-api/src",
    "apps/server/examples",
    "login",
  ])
    await mkdir(join(root, dir), { recursive: true });
  await writeFile(join(root, "docs/MOD_API.md"), "Fixture contract");
  await writeFile(
    join(root, "packages/mod-api/src/contract.ts"),
    "export interface API {}",
  );
  await writeFile(join(root, "login/auth.json"), "{}");
  let id: string | undefined;
  const activity: string[] = [];
  const builder = new WorkspaceBuilder(
    root,
    {
      CODEX_HOME: join(root, "login"),
      OPENAI_API_KEY: "parent-secret",
      TWITCH_CLIENT_SECRET: "twitch-secret",
      CODEX_MODEL: "gpt-6.1-sol",
    },
    {
      get: () => id,
      set: (value) => {
        id = value;
      },
    },
  );
  mock.run = async (prompt) => {
    const modId = /mods\/(forge-[12])\.js/.exec(prompt)?.[1];
    if (!modId) throw Error("Missing candidate");
    await writeFile(join(builder.directory, `mods/${modId}.js`), goodMod);
    if (mock.tamper)
      await writeFile(join(builder.directory, "MOD_API.md"), "changed");
  };
  return {
    root,
    builder,
    activity,
    thread: () => id,
    request: (modId = "forge-1") => ({
      modId,
      card: testCards[0]!,
      checkpoint: new World().snapshot(),
      signal: new AbortController().signal,
      activity: (line: string) => activity.push(line),
    }),
  };
}
it("runs a bounded Codex adapter, persists/reuses thread, and redacts arbitrary SDK output", async () => {
  const f = await fixture();
  try {
    expect((await f.builder.build(f.request())).source).toBe(goodMod);
    await f.builder.build(f.request("forge-2"));
    expect(mock.starts).toBe(1);
    expect(mock.calls).toBe(2);
    expect(f.thread()).toBe("fake-codex-thread");
    expect(mock.threadOptions).toMatchObject({
      sandboxMode: "workspace-write",
      networkAccessEnabled: false,
      approvalPolicy: "never",
      webSearchMode: "disabled",
      modelReasoningEffort: "low",
    });
    expect(mock.options.env).not.toHaveProperty("OPENAI_API_KEY");
    expect(mock.options.env).not.toHaveProperty("TWITCH_CLIENT_SECRET");
    expect(f.activity.join(" ")).not.toContain("SECRET");
    expect(f.activity.join(" ")).toContain("Running local Gatekeeper");
    expect(
      await readFile(join(f.builder.directory, "AGENTS.md"), "utf8"),
    ).toContain("mods/forge-2.js");
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
it("rejects reference tampering even when the SDK says its test passed", async () => {
  const f = await fixture();
  mock.tamper = true;
  try {
    await expect(f.builder.build(f.request())).rejects.toThrow(
      "read-only reference",
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
