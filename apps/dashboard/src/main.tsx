import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  dashboardSchema,
  type DashboardState,
} from "../../../packages/shared/src/chat.js";
import "./style.css";
import { ForgePanel } from "./forge-panel.js";

const base =
  location.port === "5174"
    ? `http://${location.hostname}:3000`
    : location.origin;
function Dashboard() {
  const [state, setState] = useState<DashboardState>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch(`${base}/api/status`, {
          signal: controller.signal,
        });
        if (!response.ok) throw Error("Server unavailable");
        const data = dashboardSchema.parse(await response.json());
        if (!controller.signal.aborted) {
          setState(data);
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
      <ForgePanel base={base} />
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
                Idea Inbox <small>{state.ideas.length}</small>
              </h2>
              <p>Pending moderation · not yet approved for building</p>
              <ol className="feed">
                {[...state.ideas].reverse().map((idea) => (
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
