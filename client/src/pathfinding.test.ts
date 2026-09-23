import { describe, expect, it } from "vitest";
import type { TopoLink, TopoNode } from "./store/graphStore";
import { bfsPath, buildAdjacency, dijkstraPath, emulateFailure } from "./utils/pathfinding";

function node(id: string, status: TopoNode["status"] = "healthy"): TopoNode {
  return { id, label: id, kind: "switch", x: 0, y: 0, status, load: 0.1, updatedAt: 0 };
}

function link(id: string, source: string, target: string, weight = 1): TopoLink {
  return { id, source, target, weight, status: "up", utilization: 0.2 };
}

describe("pathfinding", () => {
  it("finds the shortest-hop BFS path", () => {
    const nodes = { a: node("a"), b: node("b"), c: node("c") };
    const links = { ab: link("ab", "a", "b"), bc: link("bc", "b", "c") };
    expect(bfsPath(nodes, links, "a", "c")).toEqual(["a", "b", "c"]);
  });

  it("returns [] for unreachable targets", () => {
    const nodes = { a: node("a"), z: node("z") };
    expect(bfsPath(nodes, {}, "a", "z")).toEqual([]);
    expect(dijkstraPath(nodes, {}, "a", "z").path).toEqual([]);
  });

  it("prefers lower OSPF cost in Dijkstra", () => {
    const nodes = { a: node("a"), b: node("b"), c: node("c") };
    const links = {
      ab: link("ab", "a", "b", 10),
      ac: link("ac", "a", "c", 1),
      cb: link("cb", "c", "b", 1)
    };
    const { path, cost } = dijkstraPath(nodes, links, "a", "b");
    expect(path).toEqual(["a", "c", "b"]);
    expect(cost).toBe(2);
  });

  it("routes around down nodes/links", () => {
    const nodes = { a: node("a"), b: node("b", "down"), c: node("c") };
    const links = { ab: link("ab", "a", "b"), ac: link("ac", "a", "c") };
    // b is down: adjacency must exclude it
    expect(buildAdjacency(nodes, links).get("a")?.map((e) => e.to)).toEqual(["c"]);
    expect(bfsPath(nodes, links, "a", "b")).toEqual([]);
  });

  it("emulates failure and recalculates", () => {
    const nodes = { a: node("a"), b: node("b"), c: node("c") };
    const links = { ab: link("ab", "a", "b"), ac: link("ac", "a", "c"), cb: link("cb", "c", "b") };
    const res = emulateFailure(nodes, links, "a", "b", ["c"]);
    expect(res.failed).toEqual(["c"]);
    expect(res.path).toEqual(["a", "b"]);
  });

  it("handles trivial and missing endpoints", () => {
    const nodes = { a: node("a") };
    expect(bfsPath(nodes, {}, "a", "a")).toEqual(["a"]);
    expect(bfsPath(nodes, {}, "a", "nope")).toEqual([]);
  });
});
