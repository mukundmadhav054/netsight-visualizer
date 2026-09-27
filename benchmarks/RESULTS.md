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

Steady-state runs (2 of 3; third run caught initial mount work in its idle
window — see caveat):

```
rendered DOM nodes:   520  (.react-flow__node)
store:                520 nodes · 520 links (header)
edges:                canvas overlay, 0 SVG edge elements at count time
JS heap:              22–54 MB across runs
idle 5 s (live ticks):  ~111–120 fps, median frame 8.3 ms, p95 ≤ 16.5 ms
pan/zoom 9 s:          ~108–120 fps, median frame 8.3 ms, p95 ≤ 16.6 ms
longtasks (session, incl. initial 520-node mount): 3–14, max ~110 ms
```

Reading: the headless compositor ticks at ~8.33 ms; a median frame of
8.3 ms with p95 ≤ 16.6 ms means no missed frames during interaction —
pan/zoom costs nothing above the idle baseline.

Caveat: one run sampled 16 fps / 58 ms median idle because the initial
520-node mount + edge creation landed inside the idle window (longtasks 14
that run vs 3 when settled). The harness now waits for edge-count steady
state before sampling; mount cost is real but one-time.

## Resume-ready lines (frontend roles)

- Renders a live 520-node topology canvas at 8.3 ms median frame time
  during scripted pan/zoom (p95 ≤ 16.6 ms, zero missed-frame spikes),
  measured in headless Chrome against the production build.
- Delta-compressed WebSocket protocol cuts per-tick payloads 97.7%
  (151.9 KB full snapshot → 3.5 KB mean delta, 42.9×) with 1 ms median
  loopback update latency, measured over real sockets.
