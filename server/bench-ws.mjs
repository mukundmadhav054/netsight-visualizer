/**
 * WS benchmark: full-snapshot vs delta payload sizes + ping/pong latency.
 *
 * Spawns the real server (`node dist/index.js`) on a bench port, connects
 * over a real WebSocket, and measures wire bytes + round-trip latency.
 *
 * Run:  node bench-ws.mjs [--port 4401] [--deltas 10] [--pings 30]
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? Number(args[i + 1]) : dflt;
};
const PORT = opt("--port", 4401);
const N_DELTAS = opt("--deltas", 10);
const N_PINGS = opt("--pings", 30);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const p95 = (xs) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * 0.95))];

const server = spawn(process.execPath, ["dist/index.js"], {
  cwd: fileURLToPath(new URL(".", import.meta.url)),
  env: { ...process.env, PORT: String(PORT) },
  stdio: "ignore",
});

function waitForPort(tries = 50) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const attempt = () => {
      n += 1;
      const ws = new WebSocket(`ws://localhost:${PORT}`);
      ws.on("open", () => {
        ws.close();
        resolve();
      });
      ws.on("error", () => {
        if (n >= tries) reject(new Error("server did not come up"));
        else setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

let exitCode = 0;
try {
  await waitForPort();

  const ws = new WebSocket(`ws://localhost:${PORT}`);
  const inbox = [];
  ws.on("message", (raw) => inbox.push(String(raw)));
  await new Promise((res, rej) => {
    ws.on("open", res);
    ws.on("error", rej);
  });

  // 1) Snapshot (full state) — first message on connect.
  while (inbox.length === 0) await sleep(100);
  const snapshotRaw = inbox.shift();
  const snapshotBytes = Buffer.byteLength(snapshotRaw, "utf8");
  const snapshot = JSON.parse(snapshotRaw);
  const snapNodes = snapshot.delta?.nodesUpsert?.length ?? 0;
  const snapLinks = snapshot.delta?.linksUpsert?.length ?? 0;

  // 2) Per-tick deltas.
  const deltaBytes = [];
  const deadline = Date.now() + (N_DELTAS + 5) * 1000 + 15000;
  while (deltaBytes.length < N_DELTAS && Date.now() < deadline) {
    const i = inbox.findIndex((m) => {
      try {
        return JSON.parse(m).type === "delta";
      } catch {
        return false;
      }
    });
    if (i >= 0) deltaBytes.push(Buffer.byteLength(inbox.splice(i, 1)[0], "utf8"));
    else await sleep(100);
  }

  // 3) Ping/pong latency (server stamps ts at send; same machine/clock).
  // Event-driven (no polling) so the bench adds ~0ms overhead.
  ws.removeAllListeners("message");
  const latencies = [];
  for (let i = 0; i < N_PINGS; i++) {
    const pongP = new Promise((resolve) => {
      const timer = setTimeout(() => {
        ws.off("message", onMsg);
        resolve(null);
      }, 2000);
      const onMsg = (raw) => {
        try {
          const m = JSON.parse(String(raw));
          if (m.type === "pong") {
            clearTimeout(timer);
            ws.off("message", onMsg);
            resolve(m);
          }
        } catch {
          /* ignore malformed */
        }
      };
      ws.on("message", onMsg);
    });
    ws.send(JSON.stringify({ type: "ping" }));
    const pong = await pongP;
    if (pong) latencies.push(Date.now() - pong.ts);
    await sleep(50);
  }
  ws.close();

  const meanDelta = deltaBytes.reduce((a, b) => a + b, 0) / Math.max(1, deltaBytes.length);
  if (args.includes("--debug")) console.error("raw latencies:", JSON.stringify(latencies));
  console.log(
    JSON.stringify(
      {
        snapshotBytes,
        snapshotNodes: snapNodes,
        snapshotLinks: snapLinks,
        deltasMeasured: deltaBytes.length,
        deltaBytesMean: Math.round(meanDelta),
        deltaBytesMedian: Math.round(median(deltaBytes)),
        deltaBytesMin: Math.min(...deltaBytes),
        deltaBytesMax: Math.max(...deltaBytes),
        reductionPctVsSnapshot: Number(
          (((snapshotBytes - meanDelta) / snapshotBytes) * 100).toFixed(1)
        ),
        fullVsDeltaRatio: Number((snapshotBytes / meanDelta).toFixed(1)),
        pingsMeasured: latencies.length,
        pingMsMedian: median(latencies),
        pingMsP95: p95(latencies),
        pingMsMax: Math.max(...latencies),
      },
      null,
      2
    )
  );
} catch (err) {
  console.error("bench failed:", err.message);
  exitCode = 1;
} finally {
  server.kill();
}
process.exit(exitCode);
