import { WebSocketServer, type WebSocket } from "ws";
import { diffDelta, startHeartbeat, broadcastDelta } from "./ws/broadcast";
import { generateTopology, mulberry32, tickTopology } from "./sim/generator";

const PORT = Number(process.env.PORT ?? 4001);

const topo = generateTopology(520, 42);
const rand = mulberry32(1337);
let seq = 0;

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws: WebSocket) => {
  // Full snapshot on connect (seq 0), then deltas.
  const snapshot = diffDelta(seq, topo.nodes, topo.links, {
    nodes: new Map(),
    links: new Map()
  });
  ws.send(JSON.stringify({ type: "snapshot", delta: snapshot }));

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(String(raw)) as { type?: string };
      if (msg.type === "ping") ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
    } catch {
      // Ignore malformed client frames.
    }
  });
});

// Shared compression cursor: fingerprints of the last broadcast state, so
// each tick sends only changed entities (mock-simple; per-client cursors
// would be the production upgrade).
const sharedCursor = { nodes: new Map<string, string>(), links: new Map<string, string>() };
// Prime the shared cursor with the initial snapshot fingerprint.
diffDelta(0, topo.nodes, topo.links, sharedCursor);

startHeartbeat(wss);

// Tick: mutate the sim and broadcast compressed deltas to all clients.
setInterval(() => {
  seq += 1;
  const changed = tickTopology(topo, rand);
  const delta = diffDelta(
    seq,
    changed.nodes.length > 0 ? changed.nodes : [],
    changed.links.length > 0 ? changed.links : [],
    // Global cursor note: per-client cursors would be ideal; a shared cursor
    // keeps this mock simple while still sending only changed entities.
    sharedCursor
  );
  broadcastDelta(wss, delta);
}, 1000);

// eslint-disable-next-line no-console
console.log(`netsight-server listening on ws://localhost:${PORT}`);
