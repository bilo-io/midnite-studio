import {
  buildDetailIndex,
  graphExists,
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
import { execGit } from '@midnite/studio-git-engine';
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
import { resolveLayoutWorkerPath, runLayoutInWorker } from '../knowledge/layout-runner';
import { defaultLogger, type Logger } from '../log';
import { handle, handleFromSender } from './handle';

type KnowledgeGetGraphResponse = z.infer<typeof schemas.KnowledgeGetGraphResponse>;
type KnowledgeGetNodeDetailResponse = z.infer<typeof schemas.KnowledgeGetNodeDetailResponse>;
type KnowledgeCheckGraphResponse = z.infer<typeof schemas.KnowledgeCheckGraphResponse>;

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
/**
 * Every stage of a `getGraph` call is logged through the one log seam. The
 * call spans a 21 MB parse, a git spawn, a worker thread and a 10 MB IPC
 * reply, and until this landed none of it left a trace in `main.log` — a
 * spinner that never resolved in a live session was undiagnosable after the
 * fact. Cheap (one line per stage per call), and `main.log` is where the
 * diagnostics view already looks.
 */
let log: Logger = defaultLogger;

/** One repo's detail index, plus the commit it was built from — so a stale one is never served. */
type DetailEntry = { builtAtCommit: string; index: Map<string, NodeDetail> };
const detailIndexes = new Map<string, DetailEntry>();

export function configureKnowledge(nextCacheDir: string, logger: Logger = defaultLogger): void {
  cacheDir = nextCacheDir;
  log = logger;
}

/** Test seam: forget every repo's cached detail index, the configured cache dir and logger. */
export function resetKnowledge(): void {
  detailIndexes.clear();
  cacheDir = '';
  log = defaultLogger;
}

function toPayload(
  lean: LeanGraph,
  positions: LayoutPositions,
  cached: boolean,
  commitsBehind: number | null,
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
    commitsBehind,
  };
}

/**
 * How far `HEAD` has moved past the commit `graph.json` was built at (Theme
 * F's staleness label — "reported, never acted on", phase doc guardrail).
 *
 * `null`, not `0` and not a thrown error, for anything that makes the count
 * meaningless: `builtAtCommit` no longer reachable (history rewritten since,
 * a rebase, a squash-merge that dropped it), or the two happen to be equal —
 * that last one IS `0`, handled by `rev-list` itself (`x..x` is an empty
 * range). Never `throwOnError`: a bad ref is data here ("cannot tell"), not a
 * failure worth surfacing over the read/layout this call already succeeded
 * at.
 */
async function countCommitsBehindHead(
  repoPath: string,
  builtAtCommit: string,
): Promise<number | null> {
  const result = await execGit(repoPath, ['rev-list', '--count', `${builtAtCommit}..HEAD`]);
  if (result.exitCode !== 0) return null;
  const count = Number.parseInt(result.stdout.trim(), 10);
  return Number.isFinite(count) ? count : null;
}

export function registerKnowledgeHandlers(): void {
  handleFromSender(
    CHANNELS.knowledgeGetGraph,
    schemas.KnowledgeGetGraphRequest,
    async (req, win): Promise<KnowledgeGetGraphResponse> => {
      const tag = `[knowledge] getGraph repo=${req.repoId}`;
      const entry = getRepo(req.repoId);
      if (!entry) {
        log.warn(`${tag} repo is not open`);
        return knowledgeError('That repository is no longer open.');
      }

      const readStarted = Date.now();
      const readResult = await readGraph(entry.path);
      if (!readResult.ok) {
        if (readResult.kind === 'absent') {
          log.info(`${tag} absent (no graphify-out/graph.json)`);
          return knowledgeAbsent();
        }
        log.warn(`${tag} ${readResult.kind}: ${readResult.message}`);
        if (readResult.kind === 'unreadable') return knowledgeUnreadable(readResult.message);
        return knowledgeMalformed(readResult.message);
      }

      detailIndexes.set(req.repoId, {
        builtAtCommit: readResult.graph.built_at_commit,
        index: buildDetailIndex(readResult.graph),
      });

      const lean = projectGraph(readResult.graph);
      const key = layoutCacheKey(lean.builtAtCommit, PROJECTION_FORMAT_VERSION);
      const commitsBehind = await countCommitsBehindHead(entry.path, lean.builtAtCommit);
      log.info(
        `${tag} read ${Date.now() - readStarted}ms nodes=${lean.nodes.length} links=${lean.links.length} ` +
          `built=${lean.builtAtCommit.slice(0, 10)} behind=${commitsBehind ?? '?'}`,
      );

      const cachedLayout = await readLayoutCache(cacheDir, req.repoId, key);
      if (cachedLayout) {
        log.info(`${tag} layout cache hit`);
        return knowledgeOk(toPayload(lean, cachedLayout.positions, true, commitsBehind));
      }

      const workerPath = resolveLayoutWorkerPath();
      log.info(`${tag} layout cache miss; cold layout via ${workerPath}`);
      const layoutStarted = Date.now();
      const layoutResult = await runLayoutInWorker(
        lean,
        { totalIterations: TOTAL_ITERATIONS, batchSize: BATCH_SIZE, workerPath },
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

      if (!layoutResult.ok) {
        log.error(`${tag} layout failed after ${Date.now() - layoutStarted}ms: ${layoutResult.message}`);
        return knowledgeError(layoutResult.message);
      }
      log.info(`${tag} layout done ${Date.now() - layoutStarted}ms`);

      try {
        await writeLayoutCache(cacheDir, req.repoId, {
          builtAtCommit: lean.builtAtCommit,
          projectionVersion: PROJECTION_FORMAT_VERSION,
          nodeCount: lean.nodes.length,
          linkCount: lean.links.length,
          positions: layoutResult.positions,
        });
      } catch (err) {
        // The layout is in hand; a cache that failed to persist costs the
        // next open a cold pass, not this one its graph.
        log.warn(
          `${tag} layout cache write failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      return knowledgeOk(toPayload(lean, layoutResult.positions, false, commitsBehind));
    },
    (issue) => knowledgeError(issue),
  );

  handle(
    CHANNELS.knowledgeCheckGraph,
    schemas.KnowledgeCheckGraphRequest,
    async (req): Promise<KnowledgeCheckGraphResponse> => {
      const entry = getRepo(req.repoId);
      if (!entry) return { exists: false };
      return { exists: await graphExists(entry.path) };
    },
    () => ({ exists: false }),
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
