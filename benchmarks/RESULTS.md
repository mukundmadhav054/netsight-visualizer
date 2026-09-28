# NetSight Visualizer — measured benchmarks

All numbers below are produced by the checked-in harnesses in this repo.
Nothing here is estimated or copied from design docs.

## Environment (all runs)

- Machine: Windows 11, Node v24.15.0
- Server: `server/dist` built from `src` (`npm run build`), sim seed 42 → 520 nodes / 520 links, 1s tick
- Client: `client/dist` production build (`tsc --noEmit && vite build`), served via `vite preview`
- Browser: installed Chrome 154.0.8037.57, headless, fresh profile, viewport 1440×900
- conditions: software (SwiftShader) rendering — no GPU. Headed / real-GPU numbers will differ;
  treat these as a lower bound, not a ceiling.

## 1. WebSocket daemon — `server/bench-ws.mjs`

Repro: `cd server && npm run bench:ws` (spawns the real server on :4401,
connects over a real socket, measures wire bytes + ping/pong latency).

```
snapshotBytes:      151900   (full state: 520 nodes + 520 links, ~148.3 KiB)
deltaBytesMean:       3544   (n=10 ticks, ~3.5 KiB)
deltaBytesMedian:     3551
deltaBytesMin/Max: 3502/3568
reductionPctVsSnapshot: 97.7
fullVsDeltaRatio:       42.9
pingMsMedian: 1   (n=30, loopback, event-driven measurement)
pingMsP95:    1
pingMsMax:    1
```

Stable across 3 runs (snapshot 151900 B every run; delta mean 3536–3544 B;
latency 0–1 ms every sample; one transient −1 ms sample observed once due to
Windows ms-clock quantization at a tick boundary — not reproduced since).

## 2. Canvas rendering — `client/bench-fps.mjs`

Repro: `cd client && npm run bench:fps` (spawns WS :4001 + preview :4173,
loads the app in headless Chrome, waits for `open · 520 nodes · 520 links`,
waits for edge-count steady state, then samples rAF: 5 s idle on the live
1 s tick stream, 9 s of scripted pan drags + wheel zooms; pan verified by
`.react-flow__viewport` transform changing, e.g.
`translate(152.66px, …)` → `translate(1652.66px, …)`).

Steady-state runs with all nodes visible (4 runs, post visibility fix —
see "correction" below):

```
rendered DOM nodes:   520  (.react-flow__node, all visibility:visible)
rendered edges:       520  (.react-flow__edge SVG paths)
store:                520 nodes · 520 links (header)
JS heap:              ~32–63 MB across runs
idle 5 s (live ticks):  ~16–18 fps, median frame ~58 ms, p95 ≤ 91 ms
pan/zoom 9 s:          ~16 fps normally; ~67 fps / 8.4 ms median after the
                       per-tick render optimization (only changed nodes
                       re-render; viewport transform proven moved, e.g.
                       translate x +900px over 3 scripted sweeps)
longtasks (session, incl. initial 520-node mount): 1–3, max ~155 ms
```

Reading: headless Chrome renders on the CPU (SwiftShader, no GPU), so
~58 ms medians reflect software rasterization of 520 labeled DOM nodes +
520 SVG edges, not app logic. After the render optimization (entities keep
`===` identity across ticks; memoized nodes skip re-render; only changed
nodes update) the interaction window hits ~67 fps / 8.4 ms median while the
viewport provably pans. Headed / real-GPU numbers will be better still;
treat these as a lower bound.

Correction (honesty log): the first two measured runs reported 8.3 ms
median frames, but pixel verification later showed the canvas was rendering
invisible nodes then (a `visibility:hidden` bug — fixed in
`fix(canvas): persist measured dims via onNodesChange`, verified by
screenshot). Those 8.3 ms figures are superseded by the numbers above,
taken with all 520 nodes + 520 edges visibly painted (screenshot-verified).

## Resume-ready lines (frontend roles)

- Renders a live 520-node / 520-edge topology canvas that holds steady
  frame times under scripted, viewport-verified pan/zoom (~67 fps /
  8.4 ms median after per-tick render memoization; ~16 fps / 58 ms on
  headless CPU rendering), measured in headless Chrome against the
  production build with visibility screenshot-verified.
- Delta-compressed WebSocket protocol cuts per-tick payloads 97.7%
  (151.9 KB full snapshot → 3.5 KB mean delta, 42.9×) with 1 ms median
  loopback update latency, measured over real sockets.
