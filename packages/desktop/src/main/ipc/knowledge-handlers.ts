import {
  buildDetailIndex,
  layoutCacheKey,
  PROJECTION_FORMAT_VERSION,
  projectGraph,
  readGraph,
  readLayoutCache,
  writeLayoutCache,
  type LayoutPositions,
  type LeanGraph,
  type NodeDetail,
} from '@midnite/studio-knowledge';
import {
  CHANNELS,
  EVENT_CHANNELS,
  knowledgeAbsent,
  knowledgeError,
  knowledgeMalformed,
  knowledgeNotFound,
  knowledgeOk,
  knowledgeUnreadable,
  schemas,
  type KnowledgeGraphPayload,
} from '@midnite/studio-shared';
import type { z } from 'zod';

import { getRepo } from '../repo-registry';
import { runLayoutInWorker } from '../knowledge/layout-runner';
import { handle, handleFromSender } from './handle';

type KnowledgeGetGraphResponse = z.infer<typeof schemas.KnowledgeGetGraphResponse>;
type KnowledgeGetNodeDetailResponse = z.infer<typeof schemas.KnowledgeGetNodeDetailResponse>;

/**
 * The Knowledge view's IPC surface (Phase 87 Theme B). Read-only over the
 * active repo's own `graphify-out/graph.json` — the app never runs graphify
 * (phase doc, Decision 4), so every handler here either reads a file that is
 * already on disk or answers from the in-memory detail index / on-disk
 * layout cache built from a read of one.
 *
 * `configureKnowledge(cacheDir)` mirrors `configureDb`'s own shape: called
 * once at boot with a directory under `app.getPath('userData')`, so this
 * module stays free of `electron` and testable — the cache dir is an ordinary
 * string parameter as far as `@midnite/studio-knowledge`'s cache functions
 * are concerned.
 */

const TOTAL_ITERATIONS = 100;
const BATCH_SIZE = 25;

let cacheDir = '';

/** One repo's detail index, plus the commit it was built from — so a stale one is never served. */
type DetailEntry = { builtAtCommit: string; index: Map<string, NodeDetail> };
const detailIndexes = new Map<string, DetailEntry>();

export function configureKnowledge(nextCacheDir: string): void {
  cacheDir = nextCacheDir;
}

/** Test seam: forget every repo's cached detail index and the configured cache dir. */
export function resetKnowledge(): void {
  detailIndexes.clear();
  cacheDir = '';
}

function toPayload(
  lean: LeanGraph,
  positions: LayoutPositions,
  cached: boolean,
): KnowledgeGraphPayload {
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
  };
}

export function registerKnowledgeHandlers(): void {
  handleFromSender(
    CHANNELS.knowledgeGetGraph,
    schemas.KnowledgeGetGraphRequest,
    async (req, win): Promise<KnowledgeGetGraphResponse> => {
      const entry = getRepo(req.repoId);
      if (!entry) return knowledgeError('That repository is no longer open.');

      const readResult = await readGraph(entry.path);
      if (!readResult.ok) {
        if (readResult.kind === 'absent') return knowledgeAbsent();
        if (readResult.kind === 'unreadable') return knowledgeUnreadable(readResult.message);
        return knowledgeMalformed(readResult.message);
      }

      detailIndexes.set(req.repoId, {
        builtAtCommit: readResult.graph.built_at_commit,
        index: buildDetailIndex(readResult.graph),
      });

      const lean = projectGraph(readResult.graph);
      const key = layoutCacheKey(lean.builtAtCommit, PROJECTION_FORMAT_VERSION);

      const cachedLayout = await readLayoutCache(cacheDir, req.repoId, key);
      if (cachedLayout) {
        return knowledgeOk(toPayload(lean, cachedLayout.positions, true));
      }

      const layoutResult = await runLayoutInWorker(
        lean,
        { totalIterations: TOTAL_ITERATIONS, batchSize: BATCH_SIZE },
        (done, total) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send(EVENT_CHANNELS.knowledgeLayoutProgress, {
              repoId: req.repoId,
              done,
              total,
            });
          }
        },
      );

      if (!layoutResult.ok) return knowledgeError(layoutResult.message);

      await writeLayoutCache(cacheDir, req.repoId, {
        builtAtCommit: lean.builtAtCommit,
        projectionVersion: PROJECTION_FORMAT_VERSION,
        nodeCount: lean.nodes.length,
        linkCount: lean.links.length,
        positions: layoutResult.positions,
      });

      return knowledgeOk(toPayload(lean, layoutResult.positions, false));
    },
    (issue) => knowledgeError(issue),
  );

  handle(
    CHANNELS.knowledgeGetNodeDetail,
    schemas.KnowledgeGetNodeDetailRequest,
    async (req): Promise<KnowledgeGetNodeDetailResponse> => {
      const entry = getRepo(req.repoId);
      if (!entry) return knowledgeError('That repository is no longer open.');

      let detail = detailIndexes.get(req.repoId);
      // Cold: no `getGraph` call has populated the index this session yet
      // (e.g. a popout asking before the main window's own `getGraph`
      // resolved) — rebuild from a fresh read rather than answering
      // not-found for a graph that plainly exists.
      if (!detail) {
        const readResult = await readGraph(entry.path);
        if (!readResult.ok) {
          if (readResult.kind === 'absent') return knowledgeAbsent();
          if (readResult.kind === 'unreadable') return knowledgeUnreadable(readResult.message);
          return knowledgeMalformed(readResult.message);
        }
        detail = {
          builtAtCommit: readResult.graph.built_at_commit,
          index: buildDetailIndex(readResult.graph),
        };
        detailIndexes.set(req.repoId, detail);
      }

      const nodeDetail = detail.index.get(req.nodeId);
      if (!nodeDetail) return knowledgeNotFound();
      return knowledgeOk(nodeDetail);
    },
    (issue) => knowledgeError(issue),
  );
}
