import { Worker } from "node:worker_threads";
import type { GateInput } from "./gatekeeper.js";
import type { GateReport } from "../../../packages/shared/src/forge.js";
export function runGate(
  input: GateInput,
  signal: AbortSignal,
): Promise<GateReport> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const worker = new Worker(new URL("./gate-worker.js", import.meta.url), {
      workerData: input,
    });
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      void worker.terminate();
    };
    const abort = () => {
      finish();
      reject(Error("Gatekeeper cancelled"));
    };
    const timer = setTimeout(() => {
      finish();
      reject(Error("Gatekeeper exceeded 45 seconds"));
    }, 45000);
    signal.addEventListener("abort", abort, { once: true });
    worker.once("message", (report: GateReport) => {
      finish();
      resolve(report);
    });
    worker.once("error", (error) => {
      finish();
      reject(error);
    });
    worker.once("exit", (code) => {
      if (code !== 0) {
        finish();
        reject(Error("Gatekeeper worker stopped"));
      }
    });
  });
}
