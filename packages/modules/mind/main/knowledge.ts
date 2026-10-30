import {
  buildDetailIndex,
  DEFAULT_LAYOUT_ID,
  isLayoutId,
  layoutCacheKey,
  layoutGraph,
  PROJECTION_FORMAT_VERSION,
  projectGraph,
  readLayoutCache,
  writeLayoutCache,
  type LayoutId,
  type LayoutPositions,
  type LeanGraph,
  type NodeDetail,
} from '@midnite/studio-knowledge';
import type { FeatureMainContext } from '@midnite/studio-runtime';
import {
  CHANNELS,
  knowledgeAbsent,
  knowledgeError,
  knowledgeNotFound,
  knowledgeOk,
  MIND_NOTEBOOK_ID,
  schemas,
  type KnowledgeGraphPayload,
  type Note,
} from '@midnite/studio-shared';

import { buildNotesGraph } from './notes-graph';

/**
 * The Knowledge view's three channels, answered from Mind's own notebook (Phase 113 Theme M).
 *
 * Studio answers these from a repository's `graphify-out/graph.json`; Mind has no repository, so the
 * graph is built from the notes themselves (`notes-graph.ts`) and run through the same
 * `@midnite/studio-knowledge` projection and layout. Nothing external is spawned, so there is no tool
 * to be missing: an empty notebook answers `absent`, which the view shows as its own empty state.
 *
 * The layout is computed in-process rather than in a worker thread: a notebook is hundreds of nodes,
 * not Studio's fifteen thousand, and the result is cached on disk by content hash so an unchanged
 * notebook never lays out twice.
 */

type KnowledgeDeps = {
  /** The notebook's notes - read fresh on every call, so an edit is visible to the next one. */
  notes: () => Promise<Note[]>;
  /** Where laid-out positions are cached (`<userData>/knowledge-cache`). */
  cacheDirectory: string;
  /** Test seam: the layout pass. Defaults to `@midnite/studio-knowledge`'s `layoutGraph`. */
  layout?: (lean: LeanGraph, layoutId: LayoutId) => LayoutPositions;
};

const TOTAL_ITERATIONS = 100;

function toPayload(lean: LeanGraph, positions: LayoutPositions, cached: boolean): KnowledgeGraphPayload {
  return {
    nodes: lean.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      community: node.community,
      communityName: node.community_name,
      fileType: node.file_type,
    })),
    links: lean.links,
    positions,
    builtAtCommit: lean.builtAtCommit,
    cached,
    // A notebook has no HEAD to fall behind.
    commitsBehind: 0,
  };
}

export const MIND_KNOWLEDGE_CHANNELS = [
  CHANNELS.knowledgeGetGraph,
  CHANNELS.knowledgeCheckGraph,
  CHANNELS.knowledgeGetNodeDetail,
] as const;

export function registerMindKnowledge(ctx: FeatureMainContext, deps: KnowledgeDeps): void {
  const layout =
    deps.layout ??
    ((lean: LeanGraph, layoutId: LayoutId) => layoutGraph(lean, { layoutId, totalIterations: TOTAL_ITERATIONS }));

  ctx.ipc.handle(
    CHANNELS.knowledgeGetGraph,
    schemas.KnowledgeGetGraphRequest,
    async (req) => {
      const notes = await deps.notes();
      if (notes.length === 0) return knowledgeAbsent<KnowledgeGraphPayload>();
      const layoutId: LayoutId = req.layoutId && isLayoutId(req.layoutId) ? req.layoutId : DEFAULT_LAYOUT_ID;
      try {
        const lean = projectGraph(buildNotesGraph(notes));
        const key = layoutCacheKey(lean.builtAtCommit, PROJECTION_FORMAT_VERSION, layoutId);
        const cached = await readLayoutCache(deps.cacheDirectory, MIND_NOTEBOOK_ID, layoutId, key);
        if (cached) return knowledgeOk(toPayload(lean, cached.positions, true));
        const positions = layout(lean, layoutId);
        await writeLayoutCache(deps.cacheDirectory, MIND_NOTEBOOK_ID, {
          builtAtCommit: lean.builtAtCommit,
          projectionVersion: PROJECTION_FORMAT_VERSION,
          layoutId,
          nodeCount: lean.nodes.length,
          linkCount: lean.links.length,
          positions,
        }).catch(() => undefined); // a cache that failed to persist costs the next open a layout, not this one its graph
        return knowledgeOk(toPayload(lean, positions, false));
      } catch (err) {
        return knowledgeError(err instanceof Error ? err.message : String(err));
      }
    },
    (issue) => knowledgeError<KnowledgeGraphPayload>(issue),
  );

  ctx.ipc.handle(
    CHANNELS.knowledgeCheckGraph,
    schemas.KnowledgeCheckGraphRequest,
    async () => ({ exists: (await deps.notes()).length > 0 }),
    () => ({ exists: false }),
  );

  ctx.ipc.handle(
    CHANNELS.knowledgeGetNodeDetail,
    schemas.KnowledgeGetNodeDetailRequest,
    async (req) => {
      const notes = await deps.notes();
      if (notes.length === 0) return knowledgeAbsent<NodeDetail>();
      const detail = buildDetailIndex(buildNotesGraph(notes)).get(req.nodeId);
      return detail ? knowledgeOk(detail) : knowledgeNotFound();
    },
    (issue) => knowledgeError<NodeDetail>(issue),
  );
}
