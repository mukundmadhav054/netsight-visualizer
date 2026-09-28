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
  /** React Flow change handler (controlled mode). Applies measured dimensions
   * and selection into the store; position/remove stay sim-owned and are ignored. */
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
      const next = { ...s.nodes };
      for (const n of nodes) {
        const prev = next[n.id];
        next[n.id] =
          prev !== undefined && n.width === undefined
            ? { ...n, width: prev.width, height: prev.height }
            : n;
      }
      return { nodes: next };
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
      const next = { ...s.links };
      for (const l of links) next[l.id] = l;
      return { links: next };
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
      const nodes = { ...s.nodes };
      for (const n of delta.nodesUpsert ?? []) {
        const prev = nodes[n.id];
        nodes[n.id] =
          prev !== undefined && n.width === undefined
            ? { ...n, width: prev.width, height: prev.height }
            : n;
      }
      for (const id of delta.nodesRemove ?? []) delete nodes[id];
      const links = { ...s.links };
      for (const l of delta.linksUpsert ?? []) links[l.id] = l;
      for (const id of delta.linksRemove ?? []) delete links[id];
      return { nodes, links, lastSeq: delta.seq };
    });
    return true;
  },

  applyNodeChanges: (changes) => {
    // undefined = no selection change seen yet this batch.
    let selected: string | null | undefined;
    const dims = new Map<string, { width: number; height: number }>();
    for (const c of changes) {
      if (c.type === "dimensions" && c.dimensions !== undefined) {
        dims.set(c.id, { width: c.dimensions.width, height: c.dimensions.height });
      } else if (c.type === "select") {
        const cur = selected !== undefined ? selected : get().selectedNodeId;
        selected = c.selected ? c.id : cur === c.id ? null : cur;
      }
      // position/remove are sim-owned: layout comes from the server stream.
    }
    if (dims.size === 0 && selected === undefined) return;
    set((s) => {
      const nodes = { ...s.nodes };
      for (const [id, d] of dims) {
        const cur = nodes[id];
        if (cur && (cur.width !== d.width || cur.height !== d.height)) {
          nodes[id] = { ...cur, width: d.width, height: d.height };
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
