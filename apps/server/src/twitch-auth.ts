import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

export const SCOPES = [
  "user:read:chat",
  "user:write:chat",
  "user:bot",
  "channel:read:subscriptions",
  "bits:read",
  "moderator:read:followers",
];
const tokenResponse = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().positive(),
});
const storedToken = z.object({
  access: z.string(),
  refresh: z.string(),
  expiresAt: z.number(),
  userId: z.string(),
  login: z.string(),
  displayName: z.string(),
});
type Token = z.infer<typeof storedToken>;
export class TwitchError extends Error {
  constructor(
    public status: number,
    public retryAfter = 30_000,
  ) {
    super(`Twitch HTTP ${status}`);
  }
}
export class OAuthStates {
  private states = new Map<string, { expires: number; browser: string }>();
  constructor(private now = Date.now) {}
  issue(browser: string): string {
    for (const [key, value] of this.states)
      if (value.expires <= this.now()) this.states.delete(key);
    if (this.states.size >= 100)
      this.states.delete(this.states.keys().next().value!);
    const state = randomBytes(32).toString("hex");
    this.states.set(state, { browser, expires: this.now() + 300_000 });
    return state;
  }
  consume(state: string, browser: string): boolean {
    const record = this.states.get(state);
    this.states.delete(state);
    return (
      !!record &&
      !!browser &&
      record.browser === browser &&
      record.expires > this.now()
    );
  }
}
export interface AuthOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  file: string;
  oauthBase?: string;
  helixBase?: string;
}
export class TwitchAuth {
  readonly states = new OAuthStates();
  private token?: Token;
  private refreshJob?: Promise<void>;
  private timer?: NodeJS.Timeout;
  private lastValidation = 0;
  private connecting = false;
  health = "disconnected";
  onDisconnect = () => {};
  constructor(private options: AuthOptions) {}
  get userId(): string {
    return this.token?.userId ?? "";
  }
  get callbackOrigin(): string {
    return new URL(this.options.redirectUri).origin;
  }
  get ready(): boolean {
    return this.health === "healthy" && !!this.token;
  }
  status() {
    return {
      health: this.health,
      account: this.token?.displayName ?? "",
      expiresAt: this.token?.expiresAt ?? 0,
      configured: !!(this.options.clientId && this.options.clientSecret),
    };
  }
  login(browser: string): string {
    if (!this.status().configured)
      throw new Error("Configure Twitch credentials in .env");
    const url = new URL(
      `${this.options.oauthBase ?? "https://id.twitch.tv/oauth2"}/authorize`,
    );
    url.search = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: this.options.redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      state: this.states.issue(browser),
    }).toString();
    return url.toString();
  }
  private async requestToken(fields: Record<string, string>) {
    const res = await fetch(
      `${this.options.oauthBase ?? "https://id.twitch.tv/oauth2"}/token`,
      {
        method: "POST",
        body: new URLSearchParams({
          client_id: this.options.clientId,
          client_secret: this.options.clientSecret,
          ...fields,
        }),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) throw new TwitchError(res.status);
    return tokenResponse.parse(await res.json());
  }
  async callback(code: string, state: string, browser: string): Promise<void> {
    if (!this.states.consume(state, browser))
      throw new Error("Invalid or expired OAuth state; reconnect Twitch");
    if (this.connecting)
      throw new Error("Twitch connection already in progress");
    this.connecting = true;
    try {
      await this.refreshJob?.catch(() => {});
      this.disconnect();
      this.health = "connecting";
      const data = await this.requestToken({
        code,
        grant_type: "authorization_code",
        redirect_uri: this.options.redirectUri,
      });
      this.token = {
        access: data.access_token,
        refresh: data.refresh_token,
        expiresAt: Date.now() + data.expires_in * 1000,
        userId: "",
        login: "",
        displayName: "",
      };
      const res = await this.rawHelix("users");
      if (!res.ok) throw new TwitchError(res.status);
      const users = z
        .object({
          data: z
            .array(
              z.object({
                id: z.string(),
                login: z.string(),
                display_name: z.string(),
              }),
            )
            .min(1),
        })
        .parse(await res.json());
      const user = users.data[0]!;
      Object.assign(this.token, {
        userId: user.id,
        login: user.login,
        displayName: user.display_name,
      });
      await this.validate();
      await this.save();
    } catch {
      this.disconnect();
      throw new Error("Twitch connection failed; reconnect Twitch");
    } finally {
      this.connecting = false;
    }
  }
  private async save(): Promise<void> {
    await mkdir(dirname(this.options.file), { recursive: true });
    const temp = `${this.options.file}.tmp`;
    try {
      await writeFile(temp, JSON.stringify(this.token), { mode: 0o600 });
      await rename(temp, this.options.file);
    } finally {
      await rm(temp, { force: true });
    }
  }
  disconnect(): void {
    this.health = "reconnect Twitch";
    this.token = undefined;
    this.onDisconnect();
  }
  async start(): Promise<void> {
    try {
      this.token = storedToken.parse(
        JSON.parse(await readFile(this.options.file, "utf8")),
      );
      await this.validate();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") this.disconnect();
    }
    this.timer = setInterval(() => {
      void this.maintain();
    }, 60_000);
  }
  stop(): void {
    clearInterval(this.timer);
  }
  async maintain(): Promise<void> {
    if (!this.token || this.connecting) return;
    try {
      if (this.token.expiresAt - Date.now() < 300_000) await this.refresh();
      if (Date.now() - this.lastValidation >= 3_600_000) await this.validate();
    } catch {
      this.disconnect();
    }
  }
  async validate(): Promise<void> {
    if (!this.token) throw new Error("Reconnect Twitch");
    const request = () =>
      fetch(
        `${this.options.oauthBase ?? "https://id.twitch.tv/oauth2"}/validate`,
        {
          headers: { Authorization: `OAuth ${this.token!.access}` },
          signal: AbortSignal.timeout(8000),
        },
      );
    let res = await request();
    if (res.status === 401) {
      await this.refresh();
      res = await request();
    }
    if (!res.ok) throw new TwitchError(res.status);
    const value = z
      .object({
        client_id: z.string(),
        user_id: z.string(),
        expires_in: z.number(),
        scopes: z.array(z.string()),
      })
      .parse(await res.json());
    if (
      value.client_id !== this.options.clientId ||
      value.user_id !== this.userId ||
      !SCOPES.every((scope) => value.scopes.includes(scope))
    )
      throw new Error("Reconnect Twitch for required permissions");
    this.token.expiresAt = Date.now() + value.expires_in * 1000;
    this.lastValidation = Date.now();
    this.health = "healthy";
  }
  async refresh(): Promise<void> {
    if (this.refreshJob) return this.refreshJob;
    this.refreshJob = (async () => {
      try {
        if (!this.token) throw new Error("No token");
        const data = await this.requestToken({
          grant_type: "refresh_token",
          refresh_token: this.token.refresh,
        });
        Object.assign(this.token, {
          access: data.access_token,
          refresh: data.refresh_token,
          expiresAt: Date.now() + data.expires_in * 1000,
        });
        await this.save();
      } catch {
        this.disconnect();
        throw new Error("Reconnect Twitch: token refresh failed");
      }
    })();
    try {
      await this.refreshJob;
    } finally {
      this.refreshJob = undefined;
    }
  }
  private rawHelix(path: string, init: RequestInit = {}): Promise<Response> {
    if (!this.token) throw new Error("Reconnect Twitch");
    return fetch(
      `${this.options.helixBase ?? "https://api.twitch.tv/helix"}/${path}`,
      {
        ...init,
        headers: {
          "Client-Id": this.options.clientId,
          Authorization: `Bearer ${this.token.access}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(8000),
      },
    );
  }
  async helix(path: string, init: RequestInit = {}): Promise<unknown> {
    if (this.token && this.token.expiresAt - Date.now() < 60_000)
      await this.refresh();
    const access = this.token?.access;
    let res = await this.rawHelix(path, init);
    if (res.status === 401) {
      if (access === this.token?.access) await this.refresh();
      res = await this.rawHelix(path, init);
    }
    if (res.status === 401) this.disconnect();
    if (!res.ok)
      throw new TwitchError(
        res.status,
        Math.max(
          30_000,
          Number(res.headers.get("Ratelimit-Reset")) * 1000 - Date.now(),
        ) || 30_000,
      );
    return res.status === 204 ? null : res.json();
  }
}
