import { create } from "zustand";

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
  /** Insert or replace normalized node entities (localized update). */
  upsertNodes: (nodes: TopoNode[]) => void;
  removeNodes: (ids: string[]) => void;
  upsertLinks: (links: TopoLink[]) => void;
  removeLinks: (ids: string[]) => void;
  /** Apply a sequenced server delta; stale packets (seq <= lastSeq) are dropped. */
  applyDelta: (delta: GraphDelta) => boolean;
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
      for (const n of nodes) next[n.id] = n;
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
      for (const n of delta.nodesUpsert ?? []) nodes[n.id] = n;
      for (const id of delta.nodesRemove ?? []) delete nodes[id];
      const links = { ...s.links };
      for (const l of delta.linksUpsert ?? []) links[l.id] = l;
      for (const id of delta.linksRemove ?? []) delete links[id];
      return { nodes, links, lastSeq: delta.seq };
    });
    return true;
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
