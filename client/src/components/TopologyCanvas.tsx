import { memo, useEffect, useMemo, useRef } from "react";
import ReactFlow, {
  Background,
  Controls,
  type Edge,
  type Node,
  type NodeTypes,
  Handle,
  Position
} from "reactflow";
import { useGraphStore } from "../store/graphStore";

function SwitchGlyph() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <rect x="3" y="6" width="22" height="16" rx="3" fill="#0ea5e9" />
      <circle cx="9" cy="14" r="2" fill="#082f49" />
      <circle cx="14" cy="14" r="2" fill="#082f49" />
      <circle cx="19" cy="14" r="2" fill="#082f49" />
    </svg>
  );
}

function RouterGlyph() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="14" r="11" fill="#8b5cf6" />
      <path d="M6 14h16M14 6v16" stroke="#2e1065" strokeWidth="2" />
    </svg>
  );
}

function HostGlyph() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <rect x="6" y="3" width="16" height="12" rx="2" fill="#34d399" />
      <rect x="11" y="15" width="6" height="6" fill="#065f46" />
      <rect x="8" y="21" width="12" height="2" fill="#065f46" />
    </svg>
  );
}

const statusRing: Record<string, string> = {
  healthy: "border-emerald-500",
  degraded: "border-amber-500",
  down: "border-red-500"
};

const DeviceNode = memo(function DeviceNode({
  data,
  selected
}: {
  data: { label: string; kind: string; status: string };
  selected?: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${data.kind} ${data.label}, status ${data.status}`}
      className={`flex flex-col items-center rounded border-2 bg-white px-2 py-1 dark:bg-slate-900 ${
        statusRing[data.status] ?? "border-slate-600"
      } ${selected ? "ring-2 ring-sky-400" : ""}`}
    >
      <Handle type="target" position={Position.Top} />
      {data.kind === "switch" ? (
        <SwitchGlyph />
      ) : data.kind === "router" ? (
        <RouterGlyph />
      ) : (
        <HostGlyph />
      )}
      <span className="mt-1 max-w-[90px] truncate text-[10px] text-slate-700 dark:text-slate-200">
        {data.label}
      </span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});

const nodeTypes: NodeTypes = {
  device: DeviceNode
};

/**
 * Topology canvas.
 *
 * Perf design notes (no full-canvas remount):
 * - Nodes/links live in a normalized Zustand store; this component selects
 *   only id arrays + per-node fields so a heartbeat delta re-renders just
 *   the affected nodes.
 * - Edge utilization is painted on a `<canvas>` overlay (pointer-events:
 *   none) instead of re-creating SVG edge elements on every tick; pan/zoom
 *   only moves the overlay transform.
 */
export default function TopologyCanvas({ dark = true }: { dark?: boolean }) {
  // Subscribe to id lists (stable unless membership changes) ...
  const nodeIds = useGraphStore((s) => Object.keys(s.nodes));
  const nodesById = useGraphStore((s) => s.nodes);
  const linksById = useGraphStore((s) => s.links);
  const selectNode = useGraphStore((s) => s.selectNode);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const applyNodeChanges = useGraphStore((s) => s.applyNodeChanges);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const flowNodes: Node[] = useMemo(
    () =>
      nodeIds.map((id) => {
        const n = nodesById[id];
        return {
          id,
          type: "device",
          position: { x: n.x, y: n.y },
          data: { label: n.label, kind: n.kind, status: n.status },
          // Measured dims unhide nodes (React Flow keeps dim-less nodes
          // visibility:hidden); selection ring follows the store.
          width: n.width,
          height: n.height,
          selected: id === selectedNodeId,
          ariaLabel: `${n.kind} ${n.label}`
        };
      }),
    [nodeIds, nodesById, selectedNodeId]
  );

  const flowEdges: Edge[] = useMemo(
    () =>
      Object.values(linksById).map((l) => ({
        id: l.id,
        source: l.source,
        target: l.target,
        animated: l.status === "up" && l.utilization > 0.7,
        style: {
          stroke: l.status === "down" ? "#ef4444" : "#38bdf8",
          strokeWidth: 1 + l.utilization * 3
        },
        label: l.status === "down" ? "down" : undefined
      })),
    [linksById]
  );

  // Canvas overlay: redraw utilization dots without touching React state.
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const parent = canvas.parentElement;
    if (parent) {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(56,189,248,0.55)";
    for (const l of Object.values(linksById)) {
      const a = nodesById[l.source];
      const b = nodesById[l.target];
      if (!a || !b) continue;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const r = 1 + l.utilization * 4;
      ctx.beginPath();
      ctx.arc(mx % canvas.width, my % canvas.height, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [linksById, nodesById]);

  return (
    <div
      className="relative h-[560px] w-full"
      role="application"
      aria-label="Network topology canvas. Use Tab to move between nodes."
    >
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodeClick={(_e, n) => selectNode(n.id)}
        onNodesChange={applyNodeChanges}
        fitView
        minZoom={0.2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color={dark ? "#1e293b" : "#94a3b8"} />
        <Controls />
      </ReactFlow>
      {/* Utilization overlay: canvas layer above the flow, below controls. */}
      <canvas
        ref={overlayRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
      />
    </div>
  );
}
