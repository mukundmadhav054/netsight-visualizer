/**
 * Resolve the topology WebSocket URL.
 *
 * - `VITE_TOPOLOGY_WS` with a scheme (ws://… / wss://…) is used as-is.
 * - A bare `host[:port]` (what Render's `fromService: { property: host }`
 *   injects, e.g. `netsight-server-abc.onrender.com`) gets `wss://`,
 *   except loopback hosts which keep plain `ws://` for local dev.
 * - Unset → local dev default.
 */
export function resolveWsUrl(raw: string | undefined): string {
  if (!raw) return "ws://localhost:4001";
  if (/^wss?:\/\//i.test(raw)) return raw;
  const host = raw.split("/")[0];
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
    return `ws://${raw}`;
  }
  return `wss://${raw}`;
}
