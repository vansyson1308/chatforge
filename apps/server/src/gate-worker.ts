import { parentPort, workerData } from "node:worker_threads";
import { gatekeeper, type GateInput } from "./gatekeeper.js";
parentPort?.postMessage(await gatekeeper(workerData as GateInput));
