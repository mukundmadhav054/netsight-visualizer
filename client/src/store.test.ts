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
});
