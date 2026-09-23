import type { WebSocket, WebSocketServer } from "ws";
import type { SimLink, SimNode } from "../sim/generator";

export interface Delta {
  seq: number;
  nodesUpsert?: SimNode[];
  nodesRemove?: string[];
  linksUpsert?: SimLink[];
  linksRemove?: string[];
}

interface LastSent {
  nodes: Map<string, string>;
  links: Map<string, string>;
}

const fp = (v: unknown): string => JSON.stringify(v);

/**
 * Delta compression: only fields that changed since the last broadcast for
 * that subscriber are included. First message per client is a full snapshot.
 */
export function diffDelta(
  seq: number,
  nodes: SimNode[],
  links: SimLink[],
  last: LastSent
): Delta {
  const nodesUpsert: SimNode[] = [];
  for (const n of nodes) {
    const key = fp(n);
    if (last.nodes.get(n.id) !== key) {
      last.nodes.set(n.id, key);
      nodesUpsert.push(n);
    }
  }
  const linksUpsert: SimLink[] = [];
  for (const l of links) {
    const key = fp(l);
    if (last.links.get(l.id) !== key) {
      last.links.set(l.id, key);
      linksUpsert.push(l);
    }
  }
  return { seq, nodesUpsert, linksUpsert };
}

export function startHeartbeat(wss: WebSocketServer, intervalMs = 15000): NodeJS.Timeout {
  return setInterval(() => {
    const payload = JSON.stringify({ type: "heartbeat", ts: Date.now() });
    for (const client of wss.clients) {
      const ws = client as WebSocket;
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
  }, intervalMs);
}

export function broadcastDelta(wss: WebSocketServer, delta: Delta): void {
  const payload = JSON.stringify({ type: "delta", delta });
  for (const client of wss.clients) {
    const ws = client as WebSocket;
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}
