export interface SimNode {
  id: string;
  label: string;
  kind: "switch" | "router" | "host";
  x: number;
  y: number;
  status: "healthy" | "degraded" | "down";
  load: number;
  updatedAt: number;
}

export interface SimLink {
  id: string;
  source: string;
  target: string;
  weight: number;
  status: "up" | "down";
  utilization: number;
}

/** Deterministic seeded PRNG (mulberry32) so sims are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Topology {
  nodes: SimNode[];
  links: SimLink[];
}

/**
 * Generate a 500+ node deterministic topology: a core of routers in a ring,
 * distribution switches hung off cores, and hosts on switches.
 */
export function generateTopology(nodeCount = 520, seed = 42): Topology {
  const rand = mulberry32(seed);
  const nodes: SimNode[] = [];
  const links: SimLink[] = [];

  const coreCount = 8;
  const distCount = Math.floor((nodeCount - coreCount) * 0.25);
  const hostCount = nodeCount - coreCount - distCount;

  const W = 1200;
  const H = 800;

  for (let i = 0; i < coreCount; i++) {
    nodes.push({
      id: `core-${i}`,
      label: `core-${i}`,
      kind: "router",
      x: W / 2 + Math.cos((i / coreCount) * Math.PI * 2) * 300,
      y: H / 2 + Math.sin((i / coreCount) * Math.PI * 2) * 220,
      status: "healthy",
      load: rand() * 0.5,
      updatedAt: Date.now()
    });
  }
  // Core ring.
  for (let i = 0; i < coreCount; i++) {
    const a = `core-${i}`;
    const b = `core-${(i + 1) % coreCount}`;
    links.push({
      id: `link-${a}-${b}`,
      source: a,
      target: b,
      weight: 10,
      status: "up",
      utilization: rand() * 0.6
    });
  }

  for (let i = 0; i < distCount; i++) {
    const id = `sw-${String(i).padStart(3, "0")}`;
    const core = `core-${i % coreCount}`;
    nodes.push({
      id,
      label: id,
      kind: "switch",
      x: rand() * W,
      y: rand() * H,
      status: rand() < 0.05 ? "degraded" : "healthy",
      load: rand(),
      updatedAt: Date.now()
    });
    links.push({
      id: `link-${core}-${id}`,
      source: core,
      target: id,
      weight: 5,
      status: "up",
      utilization: rand()
    });
  }

  for (let i = 0; i < hostCount; i++) {
    const id = `host-${String(i).padStart(3, "0")}`;
    const sw = `sw-${String(i % distCount).padStart(3, "0")}`;
    nodes.push({
      id,
      label: id,
      kind: "host",
      x: rand() * W,
      y: rand() * H,
      status: "healthy",
      load: rand() * 0.4,
      updatedAt: Date.now()
    });
    links.push({
      id: `link-${sw}-${id}`,
      source: sw,
      target: id,
      weight: 1,
      status: "up",
      utilization: rand() * 0.4
    });
  }

  return { nodes, links };
}

/** Mutate a small random subset to produce the next heartbeat delta. */
export function tickTopology(topo: Topology, rand: () => number): { nodes: SimNode[]; links: SimLink[] } {
  const changedNodes: SimNode[] = [];
  const changedLinks: SimLink[] = [];
  const n = Math.min(12, topo.nodes.length);
  for (let i = 0; i < n; i++) {
    const node = topo.nodes[Math.floor(rand() * topo.nodes.length)];
    node.load = Math.max(0, Math.min(1, node.load + (rand() - 0.5) * 0.2));
    node.updatedAt = Date.now();
    if (rand() < 0.02) node.status = node.status === "healthy" ? "degraded" : "healthy";
    changedNodes.push({ ...node });
  }
  const m = Math.min(12, topo.links.length);
  for (let i = 0; i < m; i++) {
    const link = topo.links[Math.floor(rand() * topo.links.length)];
    link.utilization = Math.max(0, Math.min(1, link.utilization + (rand() - 0.5) * 0.15));
    changedLinks.push({ ...link });
  }
  return { nodes: changedNodes, links: changedLinks };
}
