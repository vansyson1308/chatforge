import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OAuthStates, SCOPES, TwitchAuth } from "./twitch-auth.js";

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const fn of cleanups.splice(0).reverse()) await fn();
});
async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );
  const addr = server.address();
  if (!addr || typeof addr === "string") throw Error("No address");
  return `http://127.0.0.1:${addr.port}`;
}
async function fixture() {
  let refreshes = 0;
  let failRefresh = false;
  let denied = false;
  let access = "access-first";
  let validations = 0;
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/token") {
      let body = "";
      for await (const chunk of req) body += String(chunk);
      const params = new URLSearchParams(body);
      if (params.get("grant_type") === "refresh_token") {
        refreshes++;
        if (failRefresh) {
          res.writeHead(400);
          res.end(JSON.stringify({ message: "NEVER-EXPOSE-SECRET" }));
          return;
        }
        access = `access-${refreshes}`;
        denied = false;
      }
      res.end(
        JSON.stringify({
          access_token: access,
          refresh_token: "fake-refresh+/token",
          expires_in: 7200,
        }),
      );
      return;
    }
    if (req.url === "/validate") {
      validations++;
      if (denied) {
        res.writeHead(401);
        res.end("{}");
        return;
      }
      res.end(
        JSON.stringify({
          client_id: "fake-client",
          user_id: "42",
          expires_in: 7200,
          scopes: SCOPES,
        }),
      );
      return;
    }
    if (denied || req.headers.authorization !== `Bearer ${access}`) {
      res.writeHead(401);
      res.end("{}");
      return;
    }
    res.end(
      JSON.stringify({
        data: [
          { id: "42", login: "forge", display_name: "Forge", is_sent: true },
        ],
      }),
    );
  });
  const base = await listen(server);
  const dir = await mkdtemp(join(tmpdir(), "chatforge-auth-"));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, "secrets", "twitch.json");
  const options = {
    clientId: "fake-client",
    clientSecret: "fake-secret",
    redirectUri: "http://localhost:3000/auth/twitch/callback",
    file,
    oauthBase: base,
    helixBase: base,
  };
  const auth = new TwitchAuth(options);
  cleanups.push(() => auth.stop());
  return {
    auth,
    options,
    file,
    deny: () => {
      denied = true;
    },
    fail: () => {
      failRefresh = true;
      denied = true;
    },
    counts: () => ({ refreshes, validations }),
  };
}
async function connect(auth: TwitchAuth) {
  const url = new URL(auth.login("browser"));
  await auth.callback("fake-code", url.searchParams.get("state")!, "browser");
}
describe("OAuth via fake Helix/auth server only", () => {
  it("uses exact scopes and browser-bound, single-use expiring states", async () => {
    let now = 100;
    const states = new OAuthStates(() => now);
    const token = states.issue("browser");
    expect(states.consume(token, "attacker")).toBe(false);
    expect(states.consume(token, "browser")).toBe(false);
    const next = states.issue("browser");
    now += 300001;
    expect(states.consume(next, "browser")).toBe(false);
    const { auth } = await fixture();
    const url = new URL(auth.login("browser"));
    expect(url.searchParams.get("scope")?.split(" ")).toEqual(SCOPES);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/auth/twitch/callback",
    );
    await expect(auth.callback("code", "forged", "browser")).rejects.toThrow(
      "Invalid or expired",
    );
    await auth.callback("code", url.searchParams.get("state")!, "browser");
    await expect(
      auth.callback("code", url.searchParams.get("state")!, "browser"),
    ).rejects.toThrow("Invalid or expired");
  });
  it("stores tokens outside status, validates startup/hourly and refreshes 401 once", async () => {
    const f = await fixture();
    await connect(f.auth);
    expect(JSON.parse(await readFile(f.file, "utf8"))).toMatchObject({
      userId: "42",
      refresh: "fake-refresh+/token",
    });
    expect(JSON.stringify(f.auth.status())).not.toContain("fake-refresh");
    const restart = new TwitchAuth(f.options);
    cleanups.push(() => restart.stop());
    await restart.start();
    expect(f.counts().validations).toBe(2);
    f.deny();
    await Promise.all([restart.helix("users"), restart.helix("users")]);
    expect(f.counts().refreshes).toBe(1);
    expect(restart.ready).toBe(true);
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 3600001);
    await restart.maintain();
    expect(f.counts().validations).toBe(3);
  });
  it("refresh failure requests reconnect and never surfaces response secrets", async () => {
    const f = await fixture();
    await connect(f.auth);
    const disconnected = vi.fn();
    f.auth.onDisconnect = disconnected;
    f.fail();
    await expect(f.auth.helix("users")).rejects.toThrow(
      "Reconnect Twitch: token refresh failed",
    );
    expect(f.auth.status().health).toBe("reconnect Twitch");
    expect(disconnected).toHaveBeenCalled();
    expect(JSON.stringify(f.auth.status())).not.toContain("NEVER-EXPOSE");
  });
  it("proactively refreshes near expiry", async () => {
    const f = await fixture();
    await connect(f.auth);
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 7000000);
    await f.auth.maintain();
    expect(f.counts().refreshes).toBe(1);
  });
});
