import { useMemo, useState } from "react";
import { selectNodeById, useGraphStore } from "../store/graphStore";
import { dijkstraPath } from "../utils/pathfinding";
import { Badge, Button, Card, EmptyState, Stat, TextInput } from "./DesignSystem";

export default function NodeInspector({ nodeId }: { nodeId: string | null }) {
  const node = useGraphStore(nodeId ? selectNodeById(nodeId) : () => undefined);
  const nodes = useGraphStore((s) => s.nodes);
  const links = useGraphStore((s) => s.links);
  const selectNode = useGraphStore((s) => s.selectNode);
  const setNodeStatus = useGraphStore((s) => s.setNodeStatus);
  const [target, setTarget] = useState("");

  const route = useMemo(() => {
    if (!nodeId || !target || !nodes[target]) return null;
    return dijkstraPath(nodes, links, nodeId, target);
  }, [nodeId, target, nodes, links]);

  if (!nodeId || !node) {
    return (
      <Card title="Node inspector">
        <EmptyState message="Select a node on the canvas to inspect it." />
      </Card>
    );
  }

  return (
    <Card title={`Inspector — ${node.label}`}>
      <dl className="grid grid-cols-2 gap-2">
        <Stat label="Kind" value={node.kind} />
        <Stat label="Load" value={`${Math.round(node.load * 100)}%`} />
        <Stat label="Position" value={`${Math.round(node.x)}, ${Math.round(node.y)}`} />
        <Stat label="Updated" value={new Date(node.updatedAt).toLocaleTimeString()} />
      </dl>
      <p className="mt-2">
        <Badge tone={node.status === "healthy" ? "ok" : node.status === "degraded" ? "warn" : "bad"}>
          {node.status}
        </Badge>
      </p>
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" ariaLabel="Simulate node failure" onClick={() => setNodeStatus(node.id, "down")}>
          Fail node
        </Button>
        <Button variant="secondary" ariaLabel="Recover node" onClick={() => setNodeStatus(node.id, "healthy")}>
          Recover
        </Button>
        <Button variant="secondary" ariaLabel="Clear selection" onClick={() => selectNode(null)}>
          Clear
        </Button>
      </div>
      <div className="mt-3">
        <label htmlFor="route-target" className="text-xs text-slate-400">
          OSPF route target (node id)
        </label>
        <TextInput
          id="route-target"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="e.g. sw-042"
        />
        {route && (
          <p className="mt-1 text-xs text-slate-300" aria-live="polite">
            {route.path.length > 0
              ? `Path (${route.cost.toFixed(1)}): ${route.path.join(" → ")}`
              : "No route — target unreachable under current failures."}
          </p>
        )}
      </div>
    </Card>
  );
}
