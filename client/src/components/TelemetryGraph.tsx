import { useMemo } from "react";
import { selectNodeById, useGraphStore } from "../store/graphStore";
import { Card, EmptyState, Progress } from "./DesignSystem";

/** Lightweight SVG telemetry sparkline for the selected node (a11y-labelled). */
export default function TelemetryGraph({ nodeId }: { nodeId: string | null }) {
  const node = useGraphStore(nodeId ? selectNodeById(nodeId) : () => undefined);

  const points = useMemo(() => {
    if (!node) return [] as { x: number; y: number }[];
    // Deterministic pseudo-history derived from the node id so the graph
    // is stable across renders until `load` changes.
    let h = 0;
    for (const c of node.id) h = (h * 31 + c.charCodeAt(0)) % 997;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 40; i++) {
      const v = 0.5 + 0.4 * Math.sin(i / 4 + h) + (node.load - 0.5) * 0.5;
      pts.push({ x: (i / 39) * 280, y: 80 - Math.max(0, Math.min(1, v)) * 70 });
    }
    return pts;
  }, [node]);

  if (!node) {
    return (
      <Card title="Telemetry">
        <EmptyState message="No node selected." />
      </Card>
    );
  }

  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return (
    <Card title={`Telemetry — ${node.label}`}>
      <svg
        width="100%"
        height="90"
        viewBox="0 0 280 90"
        role="img"
        aria-label={`Load history for ${node.label}, current load ${Math.round(node.load * 100)} percent`}
      >
        <path d={d} fill="none" stroke="#38bdf8" strokeWidth="2" />
      </svg>
      <Progress value={node.load * 100} label={`Current load ${node.label}`} />
    </Card>
  );
}
