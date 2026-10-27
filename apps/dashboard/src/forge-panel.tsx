import { useEffect, useState } from "react";
import {
  forgeViewSchema,
  type ForgeView,
  type ForgeRound,
} from "../../../packages/shared/src/forge.js";

function Round({ round, now }: { round: ForgeRound; now: number }) {
  return (
    <div className="forge-round">
      <h3>
        Round {round.id}{" "}
        <span className="tag">{round.stage.replaceAll("_", " ")}</span>
      </h3>
      {round.deadline !== null ? (
        <p>
          {Math.max(0, Math.ceil((round.deadline - now) / 1000))} seconds
          remaining
        </p>
      ) : null}
      <div className="forge-cards">
        {round.cards.map((card, i) => (
          <article
            key={`${round.id}-${i}`}
            className={round.winner === i ? "winner" : ""}
          >
            <span className="tag">
              {i + 1} / {round.tallies[i]} votes
            </span>
            <h4>{card.title}</h4>
            <p>{card.pitch}</p>
            <p className="muted">{card.visualHook}</p>
            <small>
              {card.suggestion
                ? "Forge suggestion"
                : card.credits
                    .map(
                      (c) =>
                        `${c.source === "simulator" ? "[SIM] " : ""}@${c.name}`,
                    )
                    .join(", ")}
            </small>
            <details>
              <summary>Acceptance & risk</summary>
              <ul>
                {card.acceptance.map((a, n) => (
                  <li key={n}>{a}</li>
                ))}
              </ul>
              <p>{card.feasibility}</p>
              <p>{card.risk}</p>
            </details>
          </article>
        ))}
      </div>
    </div>
  );
}
export function ForgePanel({ base }: { base: string }) {
  const [view, setView] = useState<ForgeView>();
  const [preset, setPreset] = useState<"demo" | "normal">("demo");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let stopped = false,
      socket: WebSocket | undefined,
      retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      socket = new WebSocket(base.replace(/^http/, "ws"));
      socket.onmessage = (event) => {
        try {
          const parsed = forgeViewSchema.safeParse(
            JSON.parse(String(event.data)),
          );
          if (parsed.success) {
            setView(parsed.data);
            setError("");
          }
        } catch {
          /* Wait for a valid server snapshot. */
        }
      };
      socket.onclose = () => {
        if (!stopped) {
          setError("Forge connection lost; reconnecting...");
          retry = setTimeout(connect, 1500);
        }
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, [base]);
  async function action(name: string, body: unknown = {}): Promise<void> {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${base}/api/forge/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw Error("Action unavailable in this stage");
      setView(forgeViewSchema.parse(await response.json()));
    } catch {
      setError("Action unavailable. Check round stage and server connection.");
    } finally {
      setBusy(false);
    }
  }
  const building =
    view?.build &&
    ["BUILDING", "TESTING", "DEPLOYING"].includes(view.build.stage);
  return (
    <section className="forge-panel">
      <div className="row">
        <h2>Live Forge</h2>
        <span className="tag">{view?.running ? "RUNNING" : "STOPPED"}</span>
      </div>
      <div className="row">
        <label>
          Preset{" "}
          <select
            aria-label="Forge preset"
            value={preset}
            disabled={busy || view?.running}
            onChange={(e) => setPreset(e.target.value as "demo" | "normal")}
          >
            <option value="demo">Demo - 45s / 30s / auto-approve 10s</option>
            <option value="normal">Normal - 90s / 45s / manual approval</option>
          </select>
        </label>
        <button
          disabled={busy || !view || view.running}
          onClick={() => {
            void action("start", { preset });
          }}
        >
          Start Forge
        </button>
        <button
          disabled={busy || !view?.running}
          onClick={() => {
            void action("stop");
          }}
        >
          Stop Forge
        </button>
        <button
          className="danger"
          disabled={busy || !view}
          onClick={() => {
            void action("safe-mode");
          }}
        >
          Safe Mode
        </button>
        <a href={`${base}/forge/patch-notes`} download>
          Download patch notes
        </a>
      </div>
      <p role="status">{error || view?.notice || "Connecting to Forge..."}</p>
      {view ? (
        <>
          <p className="muted">
            {view.ideaCount} pending ideas / Builds this hour{" "}
            {view.usage.buildsThisHour}/{view.usage.cap} / Responses tokens{" "}
            {view.usage.responsesTokens.toLocaleString()}
          </p>
          {view.round ? <Round round={view.round} now={view.now} /> : null}
          {view.round?.stage === "STREAMER_APPROVAL" ? (
            <div className="row">
              <button
                disabled={busy || !!building}
                onClick={() => {
                  void action("approve");
                }}
              >
                Approve winner
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  void action("veto");
                }}
              >
                Veto winner
              </button>
              {building ? (
                <span>Waiting for the active build slot.</span>
              ) : null}
            </div>
          ) : null}
          {view.build ? (
            <div className="forge-build">
              <h3>Build / {view.build.cards[view.build.winner ?? 0]?.title}</h3>
              <p>
                <span className="tag">{view.build.stage}</span>Attempt{" "}
                {view.build.attempts}/3 /{" "}
                {(view.build.durationMs / 1000).toFixed(1)}s
              </p>
              <button
                disabled={busy || !building}
                onClick={() => {
                  void action("cancel");
                }}
              >
                Cancel build
              </button>
              {view.build.report ? (
                <ul className="gate-report">
                  {view.build.report.checks.map((check, i) => (
                    <li key={i}>
                      <strong>
                        {check.ok ? "PASS" : "FAIL"} / {check.name}
                      </strong>{" "}
                      {check.detail}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <details open>
            <summary>Codex activity</summary>
            <ol className="forge-activity">
              {view.activity.map((line, i) => (
                <li key={`${i}-${line}`}>{line}</li>
              ))}
            </ol>
          </details>
          <h3>Generated mods</h3>
          {view.mods.length ? (
            <ul className="forge-mods">
              {view.mods.map((mod) => (
                <li key={mod.id}>
                  <span>
                    {mod.title}{" "}
                    <small>
                      {mod.credits
                        .map(
                          (c) =>
                            `${c.source === "simulator" ? "[SIM] " : ""}@${c.name}`,
                        )
                        .join(", ") || "Forge suggestion"}
                    </small>
                  </span>
                  <button
                    disabled={busy}
                    onClick={() => {
                      void action("rollback", { modId: mod.id });
                    }}
                  >
                    Roll back to before this mod
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>No generated mods live yet.</p>
          )}
        </>
      ) : null}
    </section>
  );
}
