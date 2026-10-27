import { config } from "dotenv";
/** This local app's explicit credentials take precedence over a parent tool's injected credentials. */
export function loadEnvironment(
  path: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const result = config({ path, quiet: true, processEnv: env });
  for (const key of [
    "OPENAI_API_KEY",
    "TWITCH_CLIENT_ID",
    "TWITCH_CLIENT_SECRET",
  ])
    if (result.parsed?.[key]) env[key] = result.parsed[key];
}
