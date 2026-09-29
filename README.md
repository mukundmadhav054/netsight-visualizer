# NetSight Visualizer

Live network topology visualizer: a React Flow canvas streaming delta-compressed topology updates over WebSockets.

**Live demo:** Client — https://netsight-client.onrender.com · Server — https://netsight-server.onrender.com (health: https://netsight-server.onrender.com/healthz)

![stack](https://img.shields.io/badge/stack-React_18_%7C_Vite_5_%7C_TypeScript_5-blue)
![ws](https://img.shields.io/badge/transport-WebSocket-ws_8-green)
![node](https://img.shields.io/badge/node-%3E%3D20-green)
![license](https://img.shields.io/badge/license-private%2Fresearch-lightgrey)

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Benchmarks](#benchmarks)
- [Tech stack](#tech-stack)
- [Quickstart](#quickstart)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Deployment](#deployment)
- [Accessibility](#accessibility)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Live topology canvas** — `TopologyCanvas` renders the network on React Flow with nodes keyed by id; heartbeat deltas update only affected nodes, no full-canvas remount.
- **Canvas overlay for edges** — edge utilization is painted on a `<canvas>` overlay (`pointer-events: none`), so pan/zoom does not recreate SVG edges per tick.
- **Normalized entity store** — `src/store/graphStore.ts` keeps `{ nodes, links }` entities with sequenced `applyDelta`; stale/duplicate packets are dropped.
- **Resilient stream hook** — `src/hooks/useTopologyStream.ts` auto-reconnects with exponential backoff + jitter, buffers packets and flushes on an interval.
- **Pathfinding + failure emulation** — `src/utils/pathfinding.ts` implements BFS/Dijkstra (OSPF-style) routing plus link/node failure emulation.
- **Node inspector + telemetry** — `NodeInspector` and `TelemetryGraph` show per-node detail and history; shared a11y primitives live in `DesignSystem`.
- **Deterministic mock sim** — `server/src/sim/generator.ts` generates a seeded 500+ node topology (seed 42 yields 520 nodes / 520 links, 1 s tick).
- **Delta-compressed WS protocol** — `server/src/ws/broadcast.ts` diffs per-field fingerprints and sends changed entities only, with `seq` ordering plus heartbeats.
- **Health endpoint** — the WS daemon serves `/healthz` for Render health checks.

## Architecture

```text
+-----------------+      snapshot + deltas (seq)      +---------------------+
| netsight-server |  ------------------------------>  | netsight-client     |
| Node WS :4001   |   ws: snapshot, delta, heartbeat  | Vite + React 18     |
| sim/generator   |                                   | useTopologyStream   |
| ws/broadcast    |  <------------------------------  | graphStore          |
+-----------------+      ping/pong, reconnect         | TopologyCanvas      |
        |                                             | canvas edge overlay |
        | /healthz                                    +----------+----------+
        v                                                        |
   Render health check                                  React Flow render
```

Data flow:

1. The server sim ticks every 1 s and fingerprints entity fields.
2. `broadcast` sends a full snapshot on connect, then changed-entity deltas with monotonic `seq`.
3. The client buffers packets, drops stale/duplicate `seq`, and flushes on an interval into the normalized Zustand store.
4. `TopologyCanvas` re-renders only changed nodes (stable `===` entity identity + memoization); edge utilization paints to the canvas overlay.

## Benchmarks

Full methodology and repro steps: [`benchmarks/RESULTS.md`](benchmarks/RESULTS.md). All numbers are produced by the checked-in harnesses, never estimated.

- 520 nodes / 520 edges (sim seed 42, production build, headless Chrome, software rendering — a lower bound, not a ceiling).
- ~67 fps / 8.4 ms median pan interaction (scripted, viewport-verified pans after per-tick render memoization).
- 97.7% delta reduction (151.9 KB full snapshot down to ~3.5 KB mean delta, 42.9x).
- 1 ms median loopback update latency (ping/pong over real sockets).

## Tech stack

| Layer | Technology |
|---|---|
| Client | React 18.3, Vite 5, TypeScript 5.6 (strict) |
| Canvas | React Flow 11, canvas overlay for edge utilization |
| State | Zustand 4 normalized entity store |
| Styling | Tailwind CSS 3, custom design-system primitives |
| Server | Node (>= 20), TypeScript 5.6, `ws` 8 |
| Tests | Vitest 2 (client), Node bench harnesses |
| Deploy | Render Blueprint (`render.yaml`) |

## Quickstart

Prerequisites: Node >= 20.

Local dev — server (WS on `:4001`):

```powershell
npm install; npm run build; npm start
```

Local dev — client (Vite dev on `:5173`):

```powershell
npm install; npm run dev
```

Production build — client:

```powershell
npm install; npm run build
```

Production deploy: apply the Render Blueprint in [`render.yaml`](render.yaml) (see [Deployment](#deployment)).

## Project structure

```text
netsight-visualizer/
  README.md
  render.yaml                  # Render Blueprint (server + client)
  benchmarks/RESULTS.md        # measured numbers + methodology
  client/
    package.json               # dev/build/test/bench:fps scripts
    bench-fps.mjs              # canvas fps harness
    src/main.tsx               # app entry
    src/components/            # TopologyCanvas, NodeInspector, TelemetryGraph, DesignSystem
    src/hooks/useTopologyStream.ts
    src/store/graphStore.ts
    src/utils/                 # pathfinding.ts, wsUrl.ts
  server/
    package.json               # build/start/bench:ws scripts
    bench-ws.mjs               # WS wire-bytes + latency harness
    src/index.ts               # WS daemon entry (:4001, /healthz)
    src/sim/generator.ts       # seeded mock topology
    src/ws/broadcast.ts        # delta compression + heartbeat
```

## Testing

- Client unit tests (Vitest): pathfinding (BFS/Dijkstra, failure emulation) and the normalized graph store (`applyDelta` sequencing, stale-drop).
- Run: `npm run test -- --run` in `client/`.
- Bench harnesses (measured, not assertions): `npm run bench:ws` in `server/` (wire bytes + ping/pong latency) and `npm run bench:fps` in `client/` (headless-Chrome rAF sampling over the live stream plus scripted pans).
- Results are recorded in [`benchmarks/RESULTS.md`](benchmarks/RESULTS.md).

## Deployment

- Blueprint: [`render.yaml`](render.yaml) at the project root defines two services — Node web `netsight-server` (with `/healthz` health check) and static `netsight-client`.
- Env wiring: the client build reads `VITE_TOPOLOGY_WS`, auto-wired from the server's public host via `fromService`; the resolver in `client/src/utils/wsUrl.ts` upgrades the bare host to `wss://` (Vite bakes it in at build time).
- Manual step: connect GitHub in the Render dashboard before the first deploy (the CLI cannot do this).
- Free-tier wake note: the free WS service sleeps when idle — expect roughly 30–60 s cold wake on first load.
- The old Vercel deployment is superseded by this Blueprint.

## Accessibility

WCAG 2.1 AA items implemented in the client:

- Skip link and landmarks; labelled canvas region.
- Keyboard-focusable nodes with visible focus rings.
- `aria-live` connection status announcements.
- Telemetry SVGs use `role="img"` with text labels.
- Dark theme held to at least 4.5:1 text contrast.

## Contributing

Issues and pull requests are welcome. Keep changes scoped to this project (no cross-project imports), add or update Vitest coverage for store/pathfinding changes, and record any new measured numbers via the checked-in bench harnesses in `benchmarks/RESULTS.md` rather than estimating.

## License

Private / research — all rights reserved unless a license is added later.
