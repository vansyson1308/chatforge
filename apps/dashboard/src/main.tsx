import { useEffect, useState } from "react";
import { z } from "zod";
import { createRoot } from "react-dom/client";
import {
  dashboardSchema,
  ideaSchema,
  type DashboardState,
} from "../../../packages/shared/src/chat.js";
import "./style.css";
import { ForgePanel } from "./forge-panel.js";

const base =
  location.port === "5174"
    ? `http://${location.hostname}:3000`
    : location.origin;
const readinessSchema = z.object({
  twitch: z.boolean(),
  eventsub: z.boolean(),
  codexLoginFound: z.boolean(),
  openAIHealth: z.enum([
    "unverified",
    "checking",
    "healthy",
    "invalid",
    "unavailable",
    "missing",
  ]),
  overlay: z.boolean(),
  safeMode: z.boolean(),
  simulationReady: z.boolean(),
});
function Dashboard() {
  const [state, setState] = useState<DashboardState>();
  const [readiness, setReadiness] = useState<z.infer<typeof readinessSchema>>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [ideaPage, setIdeaPage] = useState(0);
  const [directorChoice, setDirectorChoice] = useState(1);
  const [inbox, setInbox] = useState<{
    ideas: DashboardState["ideas"];
    total: number;
  }>({ ideas: [], total: 0 });
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const [response, ready] = await Promise.all([
          fetch(`${base}/api/status`, { signal: controller.signal }),
          fetch(`${base}/api/readiness`, { signal: controller.signal }),
        ]);
        if (!response.ok) throw Error("Server unavailable");
        const data = dashboardSchema.parse(await response.json());
        const checks = ready.ok
          ? readinessSchema.parse(await ready.json())
          : undefined;
        if (!controller.signal.aborted) {
          setState(data);
          if (checks) setReadiness(checks);
          setError("");
        }
      } catch {
        if (!controller.signal.aborted)
          setError("Cannot reach ChatForge. Check the server terminal.");
      } finally {
        if (!controller.signal.aborted)
          timer = setTimeout(() => {
            void poll();
          }, 1000);
      }
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch(`${base}/api/ideas?page=${ideaPage}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw Error("Inbox unavailable");
        const data = z
          .object({ ideas: z.array(ideaSchema).max(30), total: z.number() })
          .parse(await response.json());
        if (!controller.signal.aborted) setInbox(data);
      } catch {
        /* Existing page remains visible until reconnect. */
      } finally {
        if (!controller.signal.aborted)
          timer = setTimeout(() => void poll(), 1000);
      }
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [ideaPage]);
  async function post(path: string, body: unknown): Promise<void> {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw Error("Request failed");
      const result = (await response.json()) as { queued?: boolean };
      setNotice(
        path.endsWith("test")
          ? result.queued
            ? "Test message queued for real Twitch chat."
            : "Not queued: connect Twitch, enable its source, or wait for the dedupe window."
          : "Settings applied.",
      );
    } catch {
      setNotice("Request failed. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main>
      <header>
        <p className="eyebrow">CHATFORGE / STREAMER DESK</p>
        <h1>Open the forge.</h1>
        <p>Your chat imagines it. Codex builds it. The game changes live.</p>
        <a href={`${base}/overlay/`} target="_blank" rel="noreferrer">
          Open overlay ↗
        </a>
      </header>
      <p role="status">{error || notice}</p>
      <section aria-label="Go-Live checklist">
        <h2>Go-Live checklist</h2>
        <p>
          Check the lights before opening your stream. Codex checks the local
          login file; the API check verifies the key without revealing it.
        </p>
        <ul className="readiness">
          {(
            [
              ["Twitch connected", readiness?.twitch],
              ["Chat EventSub connected", readiness?.eventsub],
              ["Codex login file present", readiness?.codexLoginFound],
              [
                "OpenAI API key verified",
                readiness?.openAIHealth === "healthy"
                  ? true
                  : readiness?.openAIHealth === "unverified" ||
                      readiness?.openAIHealth === "checking"
                    ? undefined
                    : false,
              ],
              ["Overlay connected", readiness?.overlay],
              ["Safe Mode off", readiness ? !readiness.safeMode : undefined],
              ["Simulation ready", readiness?.simulationReady],
            ] as const
          ).map(([label, ok]) => (
            <li key={label}>
              <span
                aria-label={
                  ok === undefined ? "unknown" : ok ? "ready" : "not ready"
                }
                className={
                  ok === undefined
                    ? "light unknown"
                    : ok
                      ? "light ready"
                      : "light not-ready"
                }
              >
                ●
              </span>{" "}
              {label}
            </li>
          ))}
        </ul>
        <button
          disabled={busy || readiness?.openAIHealth === "checking"}
          onClick={() => void post("/api/readiness/check-openai", {})}
        >
          Verify OpenAI key
        </button>
        {readiness?.openAIHealth === "unavailable" ? (
          <p>OpenAI could not be reached; the key has not been verified.</p>
        ) : null}
      </section>
      <ForgePanel base={base} />
      <details>
        <summary>Demo Director</summary>
        <p>
          Recording controls. Builds still use the real configured Builder.
          Events below are SIM only.
        </p>
        <div className="row">
          <button
            disabled={busy}
            onClick={() => void post("/api/forge/director-skip", {})}
          >
            Skip countdown
          </button>
          <label>
            Winner{" "}
            <select
              value={directorChoice}
              onChange={(e) => setDirectorChoice(Number(e.target.value))}
              aria-label="Director winner"
            >
              <option value={1}>Card 1</option>
              <option value={2}>Card 2</option>
              <option value={3}>Card 3</option>
            </select>
          </label>
          <button
            disabled={busy}
            onClick={() =>
              void post("/api/forge/director-winner", {
                choice: directorChoice,
              })
            }
          >
            Force winner
          </button>
          <button
            disabled={busy}
            onClick={() => void post("/api/forge/director-replay", {})}
          >
            Replay showcase
          </button>
          {["sub", "raid", "cheer", "follow"].map((name) => (
            <button
              key={name}
              disabled={busy}
              onClick={() =>
                void post("/api/director/event", { event: `twitch:${name}` })
              }
            >
              SIM {name}
            </button>
          ))}
          {state && (
            <label>
              SIM intensity{" "}
              <select
                value={state.config.intensity}
                onChange={(e) =>
                  void post("/api/config", {
                    ...state.config,
                    intensity: e.target.value,
                  })
                }
                aria-label="Director SIM intensity"
              >
                <option value="chill">Chill</option>
                <option value="normal">Normal</option>
                <option value="hype">Hype</option>
              </select>
            </label>
          )}
          <a
            href={`${base}/overlay/?mode=overlay&clean=1`}
            target="_blank"
            rel="noreferrer"
          >
            Open clean OBS overlay
          </a>
        </div>
      </details>
      {!state ? (
        <p>Connecting to local server…</p>
      ) : (
        <>
          <section>
            <h2>Twitch connection</h2>
            <div className="row">
              <a className="button" href={`${base}/auth/twitch/login`}>
                Connect / reconnect Twitch
              </a>
              <span>
                {state.auth.configured
                  ? "App configured"
                  : "Add Twitch credentials to .env"}
              </span>
            </div>
            <dl>
              <dt>Account</dt>
              <dd>{state.auth.account || "Not connected"}</dd>
              <dt>Token health</dt>
              <dd>{state.auth.health}</dd>
              <dt>Token expiry</dt>
              <dd>
                {state.auth.expiresAt
                  ? new Date(state.auth.expiresAt).toLocaleString()
                  : "—"}
              </dd>
              <dt>EventSub</dt>
              <dd>{state.eventsub.state}</dd>
            </dl>
            <table>
              <caption>
                Event capabilities (subscription acceptance is not proof an
                event can occur)
              </caption>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {state.eventsub.subscriptions.map((s) => (
                  <tr key={s.type}>
                    <td>
                      {s.type} v{s.version}
                    </td>
                    <td>{s.status}</td>
                    <td>{s.reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              New / non-affiliate channel: subscriptions and Bits may be
              unavailable. Crowd Sim exercises these paths.
            </p>
            <button
              disabled={
                busy ||
                state.auth.health !== "healthy" ||
                !state.config.sources.includes("twitch")
              }
              onClick={() => {
                void post("/api/chat/test", {});
              }}
            >
              Send test chat message to Twitch
            </button>
            <span className="muted"> Outbound: {state.outbound}</span>
          </section>
          <section>
            <h2>Chat sources</h2>
            <div className="row">
              <label>
                Source{" "}
                <select
                  aria-label="Source"
                  disabled={busy}
                  value={state.config.sources.join(",")}
                  onChange={(e) => {
                    void post("/api/config", {
                      ...state.config,
                      sources: e.target.value.split(","),
                    });
                  }}
                >
                  <option value="simulator">Crowd Sim only</option>
                  <option value="twitch">Twitch only</option>
                  <option value="twitch,simulator">Twitch + Crowd Sim</option>
                </select>
              </label>
              <label>
                Intensity{" "}
                <select
                  aria-label="Intensity"
                  disabled={busy}
                  value={state.config.intensity}
                  onChange={(e) => {
                    void post("/api/config", {
                      ...state.config,
                      intensity: e.target.value,
                    });
                  }}
                >
                  {["chill", "normal", "hype"].map((i) => (
                    <option key={i}>{i}</option>
                  ))}
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={state.config.autoJoin}
                  onChange={(e) => {
                    void post("/api/config", {
                      ...state.config,
                      autoJoin: e.target.checked,
                    });
                  }}
                />{" "}
                Auto-join on any chat
              </label>
            </div>
            <p>
              All simulated viewers carry a SIM tag. Simulator activity stays
              local and never sends real Twitch chat.
            </p>
          </section>
          <div className="columns">
            <section>
              <h2>Live event log</h2>
              <ol className="feed">
                {[...state.log].reverse().map((entry) => (
                  <li key={entry.id}>
                    <span className="tag">{entry.source}</span>
                    <time>{new Date(entry.time).toLocaleTimeString()}</time>
                    <p>{entry.text}</p>
                  </li>
                ))}
              </ol>
            </section>
            <section>
              <h2>
                Idea Inbox <small>{inbox.total}</small>
              </h2>
              <p>Pending moderation · not yet approved for building</p>
              <ol className="feed">
                {inbox.ideas.map((idea) => (
                  <li key={idea.id}>
                    <span className="tag">
                      {idea.source === "simulator" ? "SIM" : "Twitch"}
                    </span>
                    <strong>{idea.author}</strong>
                    <p>{idea.text}</p>
                    <small>
                      {idea.status}
                      {idea.reason ? ` — ${idea.reason}` : ""}
                    </small>
                  </li>
                ))}
              </ol>
              <div className="controls">
                <button
                  disabled={ideaPage === 0}
                  onClick={() => setIdeaPage((p) => p - 1)}
                >
                  Newer
                </button>
                <span>Page {ideaPage + 1}</span>
                <button
                  disabled={(ideaPage + 1) * 30 >= inbox.total}
                  onClick={() => setIdeaPage((p) => p + 1)}
                >
                  Older
                </button>
              </div>
              <p>
                {state.votes.length} viewers voted this round. Last vote wins.
              </p>
            </section>
          </div>
        </>
      )}
    </main>
  );
}
const root = document.getElementById("root");
if (!root) throw Error("Missing dashboard root");
createRoot(root).render(<Dashboard />);
