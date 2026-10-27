import type { IncomingMessage } from "node:http";

export function localOrigins(port: number): Set<string> {
  return new Set(
    [port, 5173, 5174].flatMap((p) => [
      `http://localhost:${p}`,
      `http://127.0.0.1:${p}`,
    ]),
  );
}
export function localRequest(
  req: Pick<IncomingMessage, "headers" | "socket">,
  port: number,
  mutation = false,
): boolean {
  if (
    !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
      req.socket.remoteAddress ?? "",
    )
  )
    return false;
  if (
    ![`localhost:${port}`, `127.0.0.1:${port}`].includes(req.headers.host ?? "")
  )
    return false;
  const origin = req.headers.origin;
  if (origin && !localOrigins(port).has(origin)) return false;
  if (req.headers["sec-fetch-site"] === "cross-site") return false;
  return (
    !mutation ||
    (!!origin && !!req.headers["content-type"]?.startsWith("application/json"))
  );
}
