import { beforeEach, describe, expect, it } from "vitest";
import { useGraphStore } from "./store/graphStore";

beforeEach(() => {
  useGraphStore.getState().reset();
});

describe("delta application", () => {
  it("applies sequenced deltas oldest-first and drops stale packets", () => {
    const s = useGraphStore.getState();
    const mk = (id: string, load: number) => ({
      id,
      label: id,
      kind: "switch" as const,
      x: 0,
      y: 0,
      status: "healthy" as const,
      load,
      updatedAt: 0
    });
    expect(s.applyDelta({ seq: 2, nodesUpsert: [mk("n2", 0.2)] })).toBe(true);
    // Stale: seq 1 after seq 2 must be ignored.
    expect(s.applyDelta({ seq: 1, nodesUpsert: [mk("n1", 0.1)] })).toBe(false);
    expect(useGraphStore.getState().nodes["n1"]).toBeUndefined();
    expect(useGraphStore.getState().nodes["n2"]?.load).toBe(0.2);
    // Removal delta advances the cursor.
    expect(s.applyDelta({ seq: 3, nodesRemove: ["n2"] })).toBe(true);
    expect(useGraphStore.getState().nodes["n2"]).toBeUndefined();
  });

  it("drops duplicate sequence numbers (idempotent apply)", () => {
    const s = useGraphStore.getState();
    s.applyDelta({ seq: 5, linksUpsert: [] });
    expect(s.applyDelta({ seq: 5, linksUpsert: [] })).toBe(false);
  });
});
