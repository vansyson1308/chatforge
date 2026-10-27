import { parentPort, workerData } from "node:worker_threads";
import { gatekeeper, type GateInput } from "./gatekeeper.js";
const report = await gatekeeper(workerData as GateInput, (check) =>
  parentPort?.postMessage({ type: "check", check }),
);
parentPort?.postMessage({ type: "result", report });
