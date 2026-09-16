/**
 * The on-disk shape `graphify update .` writes to `graphify-out/graph.json` —
 * verified against this repo's own graph (14,881 nodes, 36,032 links,
 * `built_at_commit` a full 40-char sha). Only the fields this package actually
 * reads are typed; graphify's file carries more (`hyperedges`, `graph`,
 * `directed`, `multigraph`) that nothing here touches.
 */
export type RawGraphNode = {
  id: string;
  label: string;
  community: number;
  community_name: string;
  file_type: string;
  source_file?: string;
  source_location?: string;
  /** Present on some nodes; not read by the lean projection or the layout. */
  [extra: string]: unknown;
};

export type RawGraphLink = {
  source: string;
  target: string;
  relation: string;
  /**
   * Optional in the wild — verified against this repo's own graph.json: 113 of
   * 36,032 links (all `dynamic_import`) carry no `weight` at all. Missing
   * means "graphify didn't score this edge", not "score it zero" — the
   * projection defaults it to `1`, a full-strength edge, rather than dropping
   * or zeroing it.
   */
  weight?: number;
  source_file?: string;
  source_location?: string;
  [extra: string]: unknown;
};

export type RawGraph = {
  nodes: RawGraphNode[];
  links: RawGraphLink[];
  built_at_commit: string;
  [extra: string]: unknown;
};

/**
 * `readGraph`'s result. Absent is not an error — it is the common case for an
 * un-graphified repo (Theme F renders it as a normal state), so it gets its
 * own `kind` rather than folding into `unreadable`.
 */
export type ReadGraphResult =
  | { ok: true; graph: RawGraph }
  | { ok: false; kind: 'absent' }
  | { ok: false; kind: 'unreadable'; message: string }
  | { ok: false; kind: 'malformed'; message: string };

/** What the picture actually reads — everything else is stripped by the projection. */
export type LeanNode = {
  id: string;
  label: string;
  community: number;
  community_name: string;
  file_type: string;
};

export type LeanLink = {
  source: string;
  target: string;
  relation: string;
  weight: number;
  /**
   * `confidence_score` on the wire, carried back in per the phase doc's own
   * note (Theme A's field table dropped it; Theme E's edge filter needs it
   * to "hide low-confidence inferred ones"). Missing means the same as a
   * missing `weight` — graphify didn't score this edge — so it defaults to
   * `1` (full confidence) rather than being dropped or zeroed.
   */
  confidence: number;
};

export type LeanGraph = {
  nodes: LeanNode[];
  links: LeanLink[];
  builtAtCommit: string;
};

/** A node's detail, kept out of the lean projection and fetched by id on click. */
export type NodeDetail = {
  sourceFile: string;
  sourceLocation: string;
};

export type LayoutPositions = Record<string, { x: number; y: number }>;

/** Reported while a cold layout runs — Theme D's progress bar. */
export type LayoutProgress = {
  done: number;
  total: number;
};
