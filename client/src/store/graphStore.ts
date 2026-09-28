import { create } from "zustand";
import type { NodeChange } from "reactflow";

export type NodeStatus = "healthy" | "degraded" | "down";
export type LinkStatus = "up" | "down";
export type NodeKind = "switch" | "router" | "host";

export interface TopoNode {
  id: string;
  label: string;
  kind: NodeKind;
  x: number;
  y: number;
  status: NodeStatus;
  load: number;
  updatedAt: number;
  /** Measured DOM dims (from React Flow dimension changes, not the server).
   * Required: React Flow keeps nodes `visibility: hidden` until width/height
   * are known. Deltas never carry these — upserts must preserve them. */
  width?: number;
  height?: number;
}

export interface TopoLink {
  id: string;
  source: string;
  target: string;
  /** OSPF-style cost; pathfinding minimizes total weight. */
  weight: number;
  status: LinkStatus;
  utilization: number;
}

export interface GraphDelta {
  seq: number;
  nodesUpsert?: TopoNode[];
  nodesRemove?: string[];
  linksUpsert?: TopoLink[];
  linksRemove?: string[];
}

/** Field-equality for server-owned node fields (dims handled separately). */
function topoNodeFieldsEqual(a: TopoNode, b: TopoNode): boolean {
  return (
    a.id === b.id &&
    a.label === b.label &&
    a.kind === b.kind &&
    a.x === b.x &&
    a.y === b.y &&
    a.status === b.status &&
    a.load === b.load &&
    a.updatedAt === b.updatedAt
  );
}

/** Merge an incoming node onto the previous entity, preserving measured dims
 * the server never sends. Returns the PREVIOUS reference when field-equal so
 * per-tick heartbeats don't churn memoized subscribers. */
function mergeNode(prev: TopoNode | undefined, next: TopoNode): TopoNode {
  if (prev === undefined) return next;
  const width = next.width ?? prev.width;
  const height = next.height ?? prev.height;
  if (topoNodeFieldsEqual(prev, next) && prev.width === width && prev.height === height) {
    return prev;
  }
  return { ...next, width, height };
}

function topoLinkFieldsEqual(a: TopoLink, b: TopoLink): boolean {
  return (
    a.id === b.id &&
    a.source === b.source &&
    a.target === b.target &&
    a.weight === b.weight &&
    a.status === b.status &&
    a.utilization === b.utilization
  );
}

/** Identity-preserving link merge (same contract as mergeNode, minus dims). */
function mergeLink(prev: TopoLink | undefined, next: TopoLink): TopoLink {
  if (prev === undefined || !topoLinkFieldsEqual(prev, next)) return next;
  return prev;
}

interface GraphState {
  nodes: Record<string, TopoNode>;
  links: Record<string, TopoLink>;
  selectedNodeId: string | null;
  lastSeq: number;
  /** Insert or replace normalized node entities (localized update).
   * Measured width/height survive upserts — server deltas never carry them. */
  upsertNodes: (nodes: TopoNode[]) => void;
  removeNodes: (ids: string[]) => void;
  upsertLinks: (links: TopoLink[]) => void;
  removeLinks: (ids: string[]) => void;
  /** Apply a sequenced server delta; stale packets (seq <= lastSeq) are dropped. */
  applyDelta: (delta: GraphDelta) => boolean;
  /** React Flow change handler (controlled mode). Applies measured dimensions,
   * user drag positions, and selection into the store; removes stay sim-owned
   * and are ignored. Server ticks only overwrite nodes listed in the delta,
   * so a dragged node keeps its position until the sim moves it. */
  applyNodeChanges: (changes: NodeChange[]) => void;
  selectNode: (id: string | null) => void;
  setNodeStatus: (id: string, status: NodeStatus) => void;
  reset: () => void;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: {},
  links: {},
  selectedNodeId: null,
  lastSeq: -1,

  upsertNodes: (nodes) =>
    set((s) => {
      let next: Record<string, TopoNode> | null = null;
      for (const n of nodes) {
        const cur = (next ?? s.nodes)[n.id];
        const merged = mergeNode(cur, n);
        if (merged !== cur) {
          if (!next) next = { ...s.nodes };
          next[n.id] = merged;
        }
      }
      // Nothing changed: return same state so subscribers aren't notified.
      return next === null ? s : { nodes: next };
    }),

  removeNodes: (ids) =>
    set((s) => {
      const next = { ...s.nodes };
      for (const id of ids) delete next[id];
      return {
        nodes: next,
        selectedNodeId:
          s.selectedNodeId !== null && ids.includes(s.selectedNodeId)
            ? null
            : s.selectedNodeId
      };
    }),

  upsertLinks: (links) =>
    set((s) => {
      let next: Record<string, TopoLink> | null = null;
      for (const l of links) {
        const cur = (next ?? s.links)[l.id];
        const merged = mergeLink(cur, l);
        if (merged !== cur) {
          if (!next) next = { ...s.links };
          next[l.id] = merged;
        }
      }
      return next === null ? s : { links: next };
    }),

  removeLinks: (ids) =>
    set((s) => {
      const next = { ...s.links };
      for (const id of ids) delete next[id];
      return { links: next };
    }),

  applyDelta: (delta) => {
    const { lastSeq } = get();
    if (delta.seq <= lastSeq) return false; // stale / duplicate
    set((s) => {
      let nodes = s.nodes;
      let links = s.links;
      if (delta.nodesUpsert !== undefined && delta.nodesUpsert.length > 0) {
        let next: Record<string, TopoNode> | null = null;
        for (const n of delta.nodesUpsert) {
          const cur = (next ?? nodes)[n.id];
          const merged = mergeNode(cur, n);
          if (merged !== cur) {
            if (!next) next = { ...nodes };
            next[n.id] = merged;
          }
        }
        if (next) nodes = next;
      }
      if (delta.nodesRemove !== undefined && delta.nodesRemove.length > 0) {
        const doomed = delta.nodesRemove.filter((id) => nodes[id] !== undefined);
        if (doomed.length > 0) {
          // `nodes` is already a private copy when an upsert ran above.
          const next = nodes === s.nodes ? { ...nodes } : nodes;
          for (const id of doomed) delete next[id];
          nodes = next;
        }
      }
      if (delta.linksUpsert !== undefined && delta.linksUpsert.length > 0) {
        let next: Record<string, TopoLink> | null = null;
        for (const l of delta.linksUpsert) {
          const cur = (next ?? links)[l.id];
          const merged = mergeLink(cur, l);
          if (merged !== cur) {
            if (!next) next = { ...links };
            next[l.id] = merged;
          }
        }
        if (next) links = next;
      }
      if (delta.linksRemove !== undefined && delta.linksRemove.length > 0) {
        const doomed = delta.linksRemove.filter((id) => links[id] !== undefined);
        if (doomed.length > 0) {
          const next = links === s.links ? { ...links } : links;
          for (const id of doomed) delete next[id];
          links = next;
        }
      }
      // No entity changed: keep nodes/links refs (no subscriber churn) and
      // only advance the sequence guard.
      if (nodes === s.nodes && links === s.links) return { lastSeq: delta.seq };
      return { nodes, links, lastSeq: delta.seq };
    });
    return true;
  },

  applyNodeChanges: (changes) => {
    // undefined = no selection change seen yet this batch.
    let selected: string | null | undefined;
    const dims = new Map<string, { width: number; height: number }>();
    const moves = new Map<string, { x: number; y: number }>();
    for (const c of changes) {
      if (c.type === "dimensions" && c.dimensions !== undefined) {
        dims.set(c.id, { width: c.dimensions.width, height: c.dimensions.height });
      } else if (c.type === "select") {
        const cur = selected !== undefined ? selected : get().selectedNodeId;
        selected = c.selected ? c.id : cur === c.id ? null : cur;
      } else if (c.type === "position" && c.position !== undefined) {
        // User drag: sim-owned layout only overwrites nodes the server
        // actually lists in a later delta, so the drag persists until then.
        moves.set(c.id, { x: c.position.x, y: c.position.y });
      }
      // remove stays sim-owned: layout/membership comes from the server stream.
    }
    if (dims.size === 0 && selected === undefined && moves.size === 0) return;
    set((s) => {
      const nodes = { ...s.nodes };
      for (const [id, d] of dims) {
        const cur = nodes[id];
        if (cur && (cur.width !== d.width || cur.height !== d.height)) {
          nodes[id] = { ...cur, width: d.width, height: d.height };
        }
      }
      for (const [id, p] of moves) {
        const cur = nodes[id];
        if (cur && (cur.x !== p.x || cur.y !== p.y)) {
          nodes[id] = { ...cur, x: p.x, y: p.y };
        }
      }
      return selected === undefined ? { nodes } : { nodes, selectedNodeId: selected };
    });
  },

  selectNode: (id) => set({ selectedNodeId: id }),

  setNodeStatus: (id, status) =>
    set((s) => {
      const cur = s.nodes[id];
      if (!cur) return s;
      return { nodes: { ...s.nodes, [id]: { ...cur, status } } };
    }),

  reset: () => set({ nodes: {}, links: {}, selectedNodeId: null, lastSeq: -1 })
}));

/** Selectors keep React Flow nodes localized: components subscribe per-id. */
export const selectNodeById = (id: string) => (s: GraphState) => s.nodes[id];
export const selectLinkById = (id: string) => (s: GraphState) => s.links[id];
