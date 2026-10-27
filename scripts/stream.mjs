import { fileURLToPath } from "node:url";
import { loadEnvironment } from "../apps/server/dist/apps/server/src/environment.js";
loadEnvironment(fileURLToPath(new URL("../.env", import.meta.url)));
const port = process.env.PORT || "3000";
console.log("Starting ChatForge for your stream.");
console.log(`Dashboard: http://localhost:${port}/dashboard/`);
console.log(`Overlay: http://localhost:${port}/overlay/?mode=overlay`);
console.log(
  "OBS: add a Browser Source with that overlay URL, width 1920 and height 1080.",
);
console.log("Press Ctrl+C to stop the local server.");
process.chdir(fileURLToPath(new URL("../apps/server/", import.meta.url)));
await import("../apps/server/dist/apps/server/src/main.js");
