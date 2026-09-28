import { useEffect, useState } from "react";
import TopologyCanvas from "./components/TopologyCanvas";
import NodeInspector from "./components/NodeInspector";
import TelemetryGraph from "./components/TelemetryGraph";
import { Card, Button } from "./components/DesignSystem";
import { useTopologyStream } from "./hooks/useTopologyStream";
import { useGraphStore } from "./store/graphStore";
import { resolveWsUrl } from "./utils/wsUrl";

const WS_URL = resolveWsUrl(
  (import.meta as unknown as { env: Record<string, string | undefined> }).env
    ?.VITE_TOPOLOGY_WS
);

export default function App() {
  const { status, buffered } = useTopologyStream(WS_URL);
  const [dark, setDark] = useState(true);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const nodeCount = useGraphStore((s) => Object.keys(s.nodes).length);
  const linkCount = useGraphStore((s) => Object.keys(s.links).length);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <a
        href="#canvas"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-sky-600 focus:px-4 focus:py-2"
      >
        Skip to topology canvas
      </a>
      <header
        className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800"
        role="banner"
      >
        <div>
          <h1 className="text-lg font-semibold">NetSight Visualizer</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
            {status} · {nodeCount} nodes · {linkCount} links
            {buffered > 0 ? ` · ${buffered} buffered` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            ariaLabel="Toggle color theme"
            onClick={() => setDark((d) => !d)}
          >
            {dark ? "Light" : "Dark"} mode
          </Button>
        </div>
      </header>
      <main className="grid gap-4 p-4 lg:grid-cols-[1fr_320px]">
        <Card title="Topology" id="canvas">
          <TopologyCanvas dark={dark} />
        </Card>
        <div className="flex flex-col gap-4">
          <NodeInspector nodeId={selectedNodeId} />
          <TelemetryGraph nodeId={selectedNodeId} />
        </div>
      </main>
    </div>
  );
}
