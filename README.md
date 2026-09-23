# NetSight Visualizer

Interactive network topology visualizer: Vite + React 18 + TypeScript (strict) client with React Flow canvas and Zustand normalized store, plus a Node.js WebSocket daemon streaming delta-compressed topology heartbeats.

## Layout

- `client/` — Vite React app (`src/main.tsx` entry)
  - `src/components/` — `TopologyCanvas`, `NodeInspector`, `TelemetryGraph`, `DesignSystem` (11+ reusable a11y primitives)
  - `src/hooks/useTopologyStream.ts` — auto-reconnect (exponential backoff + jitter), packet buffering + interval flush
  - `src/store/graphStore.ts` — normalized `{ nodes, links }` entity store with sequenced `applyDelta`
  - `src/utils/` — `layout.ts` (grid seed + bounded d3-force relaxation), `pathfinding.ts` (BFS/Dijkstra OSPF + failure emulation)
- `server/` — WS daemon (`src/index.ts`, WS on `:4001`)
  - `src/sim/generator.ts` — deterministic seeded 500+ node mock sim
  - `src/ws/broadcast.ts` — delta-compression + heartbeat

## Run

Client:

```sh
npm install; npm run build; npm run test -- --run
```

Server:

```sh
npm install; npm run build; npm start   # WS on :4001
```

## Perf design notes

- Normalized Zustand entities → heartbeat deltas update only affected nodes; no full-canvas remount (React Flow nodes keyed by id).
- Edge utilization painted on a `<canvas>` overlay (`pointer-events: none`) so pan/zoom doesn't recreate SVG edges per tick.
- Server sends changed entities only (per-field fingerprint diff) with `seq` ordering; client drops stale/duplicate packets and flushes buffered packets on an interval.
- Initial paint uses a deterministic grid layout; d3-force runs a bounded synchronous relaxation off the render path.

## Accessibility (WCAG 2.1 AA)

- Skip link, landmarks, labelled canvas region, keyboard-focusable nodes with visible focus rings, `aria-live` connection status, SVG `role="img"` telemetry labels, ≥4.5:1 dark-theme contrast.
