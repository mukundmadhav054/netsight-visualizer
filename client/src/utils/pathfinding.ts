import type { TopoLink, TopoNode, NodeStatus } from "../store/graphStore";

export interface AdjEntry {
  to: string;
  weight: number;
  linkId: string;
}

export function buildAdjacency(
  nodes: Record<string, TopoNode>,
  links: Record<string, TopoLink>,
  opts: { failedNodes?: Set<string>; failedLinks?: Set<string> } = {}
): Map<string, AdjEntry[]> {
  const adj = new Map<string, AdjEntry[]>();
  for (const id of Object.keys(nodes)) adj.set(id, []);
  for (const link of Object.values(links)) {
    if (link.status === "down") continue;
    if (opts.failedLinks?.has(link.id)) continue;
    const a = nodes[link.source];
    const b = nodes[link.target];
    if (!a || !b) continue;
    if (a.status === "down" || b.status === "down") continue;
    if (opts.failedNodes?.has(a.id) || opts.failedNodes?.has(b.id)) continue;
    adj.get(a.id)?.push({ to: b.id, weight: link.weight, linkId: link.id });
    adj.get(b.id)?.push({ to: a.id, weight: link.weight, linkId: link.id });
  }
  return adj;
}

/** Unweighted BFS shortest-hop path (OSPF equal-cost baseline). */
export function bfsPath(
  nodes: Record<string, TopoNode>,
  links: Record<string, TopoLink>,
  from: string,
  to: string,
  failedNodes: Set<string> = new Set()
): string[] {
  if (!nodes[from] || !nodes[to]) return [];
  if (from === to) return [from];
  const adj = buildAdjacency(nodes, links, { failedNodes });
  const prev = new Map<string, string | null>([[from, null]]);
  const queue: string[] = [from];
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    if (cur === to) break;
    for (const e of adj.get(cur) ?? []) {
      if (!prev.has(e.to)) {
        prev.set(e.to, cur);
        queue.push(e.to);
      }
    }
  }
  if (!prev.has(to)) return [];
  const path: string[] = [];
  let cur: string | null | undefined = to;
  while (cur !== null && cur !== undefined) {
    path.unshift(cur);
    cur = prev.get(cur) ?? null;
  }
  return path;
}

export interface DijkstraResult {
  path: string[];
  cost: number;
}

/** Weighted Dijkstra (OSPF cost-aware). Returns empty path when unreachable. */
export function dijkstraPath(
  nodes: Record<string, TopoNode>,
  links: Record<string, TopoLink>,
  from: string,
  to: string,
  failedNodes: Set<string> = new Set()
): DijkstraResult {
  if (!nodes[from] || !nodes[to]) return { path: [], cost: Infinity };
  if (from === to) return { path: [from], cost: 0 };
  const adj = buildAdjacency(nodes, links, { failedNodes });
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string | null>([[from, null]]);
  const visited = new Set<string>();
  // Simple O(V^2) loop — deterministic and dependency-free; fine for tests.
  for (;;) {
    let cur: string | null = null;
    let best = Infinity;
    for (const [id, d] of dist) {
      if (!visited.has(id) && d < best) {
        best = d;
        cur = id;
      }
    }
    if (cur === null) break;
    if (cur === to) break;
    visited.add(cur);
    for (const e of adj.get(cur) ?? []) {
      const nd = (dist.get(cur) as number) + e.weight;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, cur);
      }
    }
  }
  if (!prev.has(to)) return { path: [], cost: Infinity };
  const path: string[] = [];
  let cur: string | null | undefined = to;
  while (cur !== null && cur !== undefined) {
    path.unshift(cur);
    cur = prev.get(cur) ?? null;
  }
  return { path, cost: dist.get(to) ?? Infinity };
}

/**
 * Failure emulation: mark nodes down and recompute the route.
 * Returns the backup path plus which nodes were treated as failed.
 */
export function emulateFailure(
  nodes: Record<string, TopoNode>,
  links: Record<string, TopoLink>,
  from: string,
  to: string,
  failIds: string[]
): { path: string[]; cost: number; failed: string[] } {
  const failed = new Set(failIds);
  const before = dijkstraPath(nodes, links, from, to);
  void before;
  const failedNodes: Record<string, TopoNode> = { ...nodes };
  for (const id of failed) {
    const n = failedNodes[id];
    if (n) failedNodes[id] = { ...n, status: "down" as NodeStatus };
  }
  const { path, cost } = dijkstraPath(failedNodes, links, from, to);
  return { path, cost, failed: [...failed] };
}
