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

  it("ignores sim-owned remove changes", () => {
    const s = useGraphStore.getState();
    s.upsertNodes([node("a")]);
    s.applyNodeChanges([{ id: "a", type: "remove" }]);
    expect(useGraphStore.getState().nodes["a"]).toBeDefined();
  });

  it("applies drag positions; untouched siblings keep identity", () => {
    const s = useGraphStore.getState();
    s.upsertNodes([node("a"), node("b")]);
    const bBefore = useGraphStore.getState().nodes["b"];
    s.applyNodeChanges([{ id: "a", type: "position", position: { x: 50, y: 60 } }]);
    const st = useGraphStore.getState();
    expect(st.nodes["a"]?.x).toBe(50);
    expect(st.nodes["a"]?.y).toBe(60);
    expect(st.nodes["b"]).toBe(bBefore);
    // Positions for unknown ids create nothing.
    s.applyNodeChanges([{ id: "ghost", type: "position", position: { x: 5, y: 5 } }]);
    expect(useGraphStore.getState().nodes["ghost"]).toBeUndefined();
  });

  it("drag persists across ticks until the sim moves the node", () => {
    const s = useGraphStore.getState();
    s.upsertNodes([node("a"), node("b")]);
    s.applyNodeChanges([{ id: "a", type: "position", position: { x: 50, y: 60 } }]);
    // Tick touching only b: drag on a persists.
    s.applyDelta({ seq: 1, nodesUpsert: [{ ...node("b"), load: 0.9 }] });
    let st = useGraphStore.getState();
    expect(st.nodes["a"]?.x).toBe(50);
    expect(st.nodes["a"]?.y).toBe(60);
    expect(st.nodes["b"]?.load).toBe(0.9);
    // Sim moves a: server wins.
    s.applyDelta({ seq: 2, nodesUpsert: [{ ...node("a"), x: 7, y: 8 }] });
    st = useGraphStore.getState();
    expect(st.nodes["a"]?.x).toBe(7);
    expect(st.nodes["a"]?.y).toBe(8);
  });

  it("preserves entity identity for unchanged nodes across upserts and deltas", () => {
    const s = useGraphStore.getState();
    s.upsertNodes([node("a"), node("b")]);
    const before = useGraphStore.getState().nodes;
    const aBefore = before["a"];
    const bBefore = before["b"];
    // Fresh objects, same fields: refs (and the map) must survive.
    s.upsertNodes([{ ...node("a") }, { ...node("b") }]);
    const after = useGraphStore.getState().nodes;
    expect(after).toBe(before);
    expect(after["a"]).toBe(aBefore);
    expect(after["b"]).toBe(bBefore);
    // Empty delta advances the seq guard but keeps entity refs.
    expect(s.applyDelta({ seq: 1 })).toBe(true);
    const st = useGraphStore.getState();
    expect(st.lastSeq).toBe(1);
    expect(st.nodes).toBe(before);
    expect(st.nodes["a"]).toBe(aBefore);
    // Delta repeating identical content also changes nothing.
    expect(s.applyDelta({ seq: 2, nodesUpsert: [{ ...node("a") }, { ...node("b") }] })).toBe(
      true
    );
    expect(useGraphStore.getState().nodes).toBe(before);
    // Stale/duplicate packets are still dropped.
    expect(s.applyDelta({ seq: 2, nodesUpsert: [{ ...node("a"), x: 999 }] })).toBe(false);
    expect(useGraphStore.getState().nodes["a"]?.x).toBe(1);
  });

  it("changed nodes get new refs while untouched siblings keep identity", () => {
    const s = useGraphStore.getState();
    s.upsertNodes([node("a"), node("b")]);
    const bBefore = useGraphStore.getState().nodes["b"];
    s.applyDelta({ seq: 1, nodesUpsert: [{ ...node("a"), x: 10, load: 0.9 }] });
    const st = useGraphStore.getState();
    expect(st.nodes["a"]?.x).toBe(10);
    expect(st.nodes["a"]?.load).toBe(0.9);
    expect(st.nodes["b"]).toBe(bBefore);
  });
});
