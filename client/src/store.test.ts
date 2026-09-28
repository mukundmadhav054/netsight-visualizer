import { beforeEach, describe, expect, it } from "vitest";
import { useGraphStore, type TopoNode } from "./store/graphStore";

function node(id: string): TopoNode {
  return { id, label: id, kind: "router", x: 1, y: 2, status: "healthy", load: 0.3, updatedAt: 1 };
}

beforeEach(() => {
  useGraphStore.getState().reset();
});

describe("graphStore reducers", () => {
  it("upserts and removes nodes", () => {
    const s = useGraphStore.getState();
    s.upsertNodes([node("a"), node("b")]);
    expect(Object.keys(useGraphStore.getState().nodes)).toHaveLength(2);
    s.removeNodes(["a"]);
    expect(useGraphStore.getState().nodes["a"]).toBeUndefined();
  });

  it("selects and clears selection; removal clears dangling selection", () => {
    const s = useGraphStore.getState();
    s.upsertNodes([node("a")]);
    s.selectNode("a");
    expect(useGraphStore.getState().selectedNodeId).toBe("a");
    s.removeNodes(["a"]);
    expect(useGraphStore.getState().selectedNodeId).toBeNull();
  });

  it("flips node status without touching siblings", () => {
    const s = useGraphStore.getState();
    s.upsertNodes([node("a"), node("b")]);
    s.setNodeStatus("a", "down");
    expect(useGraphStore.getState().nodes["a"]?.status).toBe("down");
    expect(useGraphStore.getState().nodes["b"]?.status).toBe("healthy");
  });

  it("upserts links", () => {
    useGraphStore.getState().upsertLinks([
      { id: "e1", source: "a", target: "b", weight: 1, status: "up", utilization: 0.5 }
    ]);
    expect(useGraphStore.getState().links["e1"]?.utilization).toBe(0.5);
  });

  it("persists measured dims from React Flow dimension changes", () => {
    const s = useGraphStore.getState();
    s.upsertNodes([node("a")]);
    s.applyNodeChanges([
      { id: "a", type: "dimensions", dimensions: { width: 96, height: 40 } }
    ]);
    const n = useGraphStore.getState().nodes["a"];
    expect(n?.width).toBe(96);
    expect(n?.height).toBe(40);
  });

  it("upserts and deltas preserve measured dims the server never sends", () => {
    const s = useGraphStore.getState();
    s.upsertNodes([{ ...node("a"), width: 96, height: 40 }]);
    s.upsertNodes([node("a")]); // server payload: no dims
    expect(useGraphStore.getState().nodes["a"]?.width).toBe(96);
    s.applyDelta({ seq: 1, nodesUpsert: [node("a")] });
    expect(useGraphStore.getState().nodes["a"]?.width).toBe(96);
  });

  it("maps React Flow select changes onto selection", () => {
    const s = useGraphStore.getState();
    s.upsertNodes([node("a"), node("b")]);
    s.applyNodeChanges([{ id: "a", type: "select", selected: true }]);
    expect(useGraphStore.getState().selectedNodeId).toBe("a");
    s.applyNodeChanges([{ id: "a", type: "select", selected: false }]);
    expect(useGraphStore.getState().selectedNodeId).toBeNull();
  });

  it("ignores sim-owned position and remove changes", () => {
    const s = useGraphStore.getState();
    s.upsertNodes([node("a")]);
    s.applyNodeChanges([
      { id: "a", type: "position", position: { x: 999, y: 999 } }
    ]);
    s.applyNodeChanges([{ id: "a", type: "remove" }]);
    const n = useGraphStore.getState().nodes["a"];
    expect(n?.x).toBe(1);
    expect(n).toBeDefined();
  });
});
