import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  type SimulationNodeDatum,
  type SimulationLinkDatum
} from "d3-force";
import type { TopoLink, TopoNode } from "../store/graphStore";

interface LayoutNode extends SimulationNodeDatum {
  id: string;
}

/**
 * Deterministic grid fallback — used for the initial paint so the canvas
 * is stable before the force simulation ticks (avoids layout thrash).
 */
export function gridLayout(ids: string[], width = 1200, height = 800): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  const cols = Math.max(1, Math.ceil(Math.sqrt(ids.length)));
  ids.forEach((id, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    out[id] = {
      x: (col + 0.5) * (width / cols),
      y: (row + 0.5) * (height / Math.ceil(ids.length / cols))
    };
  });
  return out;
}

/**
 * One-shot d3-force relaxation over the current graph snapshot.
 * Runs synchronously for a bounded tick count so it stays cheap on
 * 500-node graphs; callers write results back into the normalized store.
 */
export function forceLayout(
  nodes: TopoNode[],
  links: TopoLink[],
  ticks = 60,
  width = 1200,
  height = 800
): Record<string, { x: number; y: number }> {
  const simNodes: LayoutNode[] = nodes.map((n) => ({
    id: n.id,
    x: n.x,
    y: n.y
  }));
  const simLinks: SimulationLinkDatum<LayoutNode>[] = links
    .filter((l) => l.status === "up")
    .map((l) => ({ source: l.source, target: l.target }));
  const sim = forceSimulation<LayoutNode>(simNodes)
    .force("link", forceLink<LayoutNode, SimulationLinkDatum<LayoutNode>>(simLinks).id((d) => d.id).distance(60))
    .force("charge", forceManyBody().strength(-40))
    .force("center", forceCenter(width / 2, height / 2));
  for (let i = 0; i < ticks; i++) sim.tick();
  sim.stop();
  const out: Record<string, { x: number; y: number }> = {};
  for (const n of simNodes) out[n.id] = { x: n.x ?? 0, y: n.y ?? 0 };
  return out;
}
