import { z } from 'zod';

import { ForgeIssueStateSchema } from './forge';
import type {
  ForgeProjectField,
  ForgeProjectFieldValue,
  ForgeProjectItem,
  ForgeProjectItemContent,
} from './forge-project';
import { ForgeProjectReadKindSchema } from './forge-project';

/**
 * The dependency graph's own vocabulary — derived entirely from
 * `ForgeProjectItem[]` (Phase 40/75 Theme A), never fetched on its own.
 *
 * `resolveForgeGraph` is a pure function: same items/fields/options in, same
 * `ForgeGraph` out, no `electron`, no IPC, no zod parse of untrusted input
 * (the input is already-validated `ForgeProjectItem[]`). That is what lets it
 * live in `packages/shared` next to the wire contract it reads, and be tested
 * — like `workflow-path.ts`'s arithmetic — without mounting anything.
 *
 * **Naming hazard, stated once:** `features/graph/` in `packages/app` is
 * already the *git commit* graph. Everything here is prefixed `ForgeGraph` /
 * `FORGE_GRAPH_` so a bare `GraphNode` never collides with it.
 */

export const ForgeGraphEdgeKindSchema = z.enum(['blocks', 'contains']);
export type ForgeGraphEdgeKind = z.infer<typeof ForgeGraphEdgeKindSchema>;

export const ForgeGraphEdgeSourceSchema = z.enum(['api', 'field', 'body']);
export type ForgeGraphEdgeSource = z.infer<typeof ForgeGraphEdgeSourceSchema>;

/**
 * One node of the graph — a board item, or a `foreign` issue referenced by
 * one but never itself fetched as a board row.
 *
 * `state` is `ForgeIssueStateSchema` (`'open' | 'closed'`, no `'merged'`) on
 * purpose: GraphQL's `blockedBy`/`parent`/`subIssues` connections only ever
 * return `Issue`, never `PullRequest`, so a *real* API-sourced blocker is
 * never merged. A merged PR can still show up here — matched by number
 * through the `field`/`body` layers — and is folded into `'closed'` at node
 * construction time (see `contentState` below), which is what lets every
 * later readiness check collapse to one rule: `state !== 'closed'` is unmet.
 */
export const ForgeGraphNodeSchema = z.object({
  /** ProjectV2 item node id; `''` for a foreign node never added to the board. */
  itemId: z.string(),
  /** Null only for a draft — a draft has no issue/PR number. */
  number: z.number().int().nullable(),
  /** `owner/name`; `''` means "same repo as the board" — see `boardRepo`. */
  repo: z.string().default(''),
  title: z.string(),
  kind: z.enum(['issue', 'pull', 'draft']),
  state: ForgeIssueStateSchema.nullable().default(null),
  blocked: z.boolean(),
  ready: z.boolean(),
  unmetBlockerCount: z.number().int().nonnegative(),
  foreign: z.boolean().default(false),
  /** This node's *own* `blockedBy`/`subIssues` connection was paginated past
   *  `DEPS_PAGE` (Theme A) — never true for a foreign node, whose own
   *  dependencies were never fetched at all. */
  truncated: z.boolean().default(false),
});
export type ForgeGraphNode = z.infer<typeof ForgeGraphNodeSchema>;

/**
 * One edge. **`from` is the dependent, `to` is the blocker** for a `'blocks'`
 * edge — stated here because it is the one thing every other theme gets
 * wrong if it guesses, and because Theme C ranks `to` upstream. For a
 * `'contains'` edge, `from` is the parent and `to` is the child, regardless
 * of whether the relationship was discovered via that item's own `parent`
 * field or via the *other* item's `subIssues` list — picking one canonical
 * direction for both is what lets the two ever collapse into a single edge
 * instead of rendering the same containment twice, reversed.
 */
export const ForgeGraphEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  kind: ForgeGraphEdgeKindSchema,
  source: ForgeGraphEdgeSourceSchema,
});
export type ForgeGraphEdge = z.infer<typeof ForgeGraphEdgeSchema>;

export const ForgeGraphSchema = z.object({
  nodes: z.array(ForgeGraphNodeSchema),
  edges: z.array(ForgeGraphEdgeSchema),
  /** `totalCount > ` the effective node cap. */
  truncated: z.boolean(),
  /** Distinct nodes discovered before the cap trimmed the list. */
  totalCount: z.number().int().nonnegative(),
  /** Mirrors `ForgeProjectReadKind` so a scope failure travels with the
   *  data instead of being inferred from an empty node list. Always `'ok'`
   *  out of `resolveForgeGraph` itself, which never sees the read envelope —
   *  the caller that does own the read overwrites it when the read failed. */
  kind: ForgeProjectReadKindSchema.default('ok'),
});
export type ForgeGraph = z.infer<typeof ForgeGraphSchema>;

/** A browser tab can afford the crib's 500-node cap; this is an Electron
 *  renderer that may also be holding a pty and a Monaco. */
export const FORGE_GRAPH_NODE_CAP = 300;

/** A dependency-graph reference parsed out of free text — a project-field
 *  value or an issue body — with no metadata beyond where it points. */
export interface ForgeIssueRef {
  /** `''` means "same repo as the board". */
  repo: string;
  number: number;
}

export interface ForgeGraphOptions {
  /** Case-insensitive project-field name checked for the `field` layer.
   *  Defaults to `'Blocked by'` — what GitHub's own dependency UI calls the
   *  relation. Pass `''` to disable the layer outright. */
  blockedByFieldName?: string;
  /** Node ceiling before truncation. Defaults to `FORGE_GRAPH_NODE_CAP`. */
  nodeCap?: number;
  /** `owner/name` of the board's own repo — the thing that makes an explicit
   *  same-repo reference (`field`/`body` text naming the board's own repo by
   *  its full name) normalize to `''` and collapse with the board's own
   *  item instead of minting a second, foreign-looking node for it. */
  boardRepo: string;
}

const FENCE_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`[^`\n]*`/g;
const LINK_TARGET_RE = /\]\([^)]*\)/g;

/** Case-insensitive; matches the keyword only, not what follows it. A
 *  trailing `:` is consumed when present (`blocked-by:`) and skipped when
 *  absent (`Blocked by #12`). Deliberately excludes `Blocks` — the inverse
 *  relation, which would name an edge on a *different* node than the one
 *  whose prose is being read. */
const KEYWORD_RE = /\b(?:blocked[ -]by|depends on|requires)\b:?/gi;

/** One `#12` or `owner/repo#12`, optionally preceded by a `,`/`and`/`&`
 *  separator (and by whitespace either way) — so it can be chained to pull a
 *  whole comma/`and`-separated list out of one match position. */
const REF_STEP_RE = /^[ \t]*(?:(?:,|and|&)[ \t]*)?((?:[\w.-]+\/[\w.-]+)?)#(\d+)/;

/**
 * Pulls every `Blocked by #12` / `blocked-by: #12` / `Depends on #12` /
 * `Requires #12` reference — singular or a comma/`and`-separated list, same
 * repo or `owner/repo#12` — out of free text.
 *
 * The lowest-confidence layer in the ladder, so its failure mode is always
 * "no edge", never "wrong edge" and never a thrown error: an empty or
 * whitespace body returns `[]`, and a keyword match that turns out not to be
 * followed by any ref (e.g. a false "blocked-by" heading naming no issue)
 * simply contributes nothing.
 */
export function parseBlockerRefs(body: string): ForgeIssueRef[] {
  if (!body || !body.trim()) return [];

  // Diffs and URLs both paste `#12`-shaped text routinely; strip fenced code,
  // inline code and a markdown link's target (the `(...)`, not its visible
  // text) before matching anything.
  const cleaned = body
    .replace(FENCE_RE, ' ')
    .replace(INLINE_CODE_RE, ' ')
    .replace(LINK_TARGET_RE, ' ');

  const refs: ForgeIssueRef[] = [];
  KEYWORD_RE.lastIndex = 0;
  let keywordMatch: RegExpExecArray | null;
  while ((keywordMatch = KEYWORD_RE.exec(cleaned)) !== null) {
    let rest = cleaned.slice(keywordMatch.index + keywordMatch[0].length);
    let stepMatch: RegExpExecArray | null;
    while ((stepMatch = REF_STEP_RE.exec(rest)) !== null) {
      refs.push({ repo: stepMatch[1] ?? '', number: Number(stepMatch[2]) });
      rest = rest.slice(stepMatch[0].length);
    }
  }
  return refs;
}

/** Number/repo pair a graph node keys on — the empty string means "the
 *  board's own repo", matching `ForgeIssueLink.repo`'s convention. */
function normalizeRepo(repo: string, boardRepo: string): string {
  const trimmed = repo.trim();
  if (!trimmed) return '';
  return trimmed.toLowerCase() === boardRepo.trim().toLowerCase() ? '' : trimmed;
}

function keyForNumber(repo: string, number: number, boardRepo: string): string {
  return `${normalizeRepo(repo, boardRepo)}#${number}`;
}

function contentNumber(content: ForgeProjectItemContent): number | null {
  return content.type === 'draft' ? null : content.number;
}

function contentState(content: ForgeProjectItemContent): 'open' | 'closed' | null {
  if (content.type === 'draft') return null;
  if (content.type === 'issue') return content.state;
  // A merged PR is not a state `ForgeGraphNodeSchema` can express (see its
  // own doc comment) — fold it into 'closed' here, once, at the only point a
  // pull item's real state is read.
  return content.state === 'open' ? 'open' : 'closed';
}

/** The textual value of one field entry, regardless of its `dataType` — a
 *  `'Blocked by'` field could reasonably be typed `text`, or an option name
 *  standing in for one (`single_select`), and this reads either the same way
 *  rather than assuming the column author picked `text`. */
function fieldValueText(value: ForgeProjectFieldValue): string {
  switch (value.dataType) {
    case 'text':
      return value.text;
    case 'single_select':
      return value.name;
    case 'date':
      return value.date;
    case 'number':
      return String(value.number);
    case 'iteration':
      return value.title;
    default:
      return '';
  }
}

type EdgeSource = z.infer<typeof ForgeGraphEdgeSourceSchema>;

interface CandidateRef extends ForgeIssueRef {
  source: EdgeSource;
  title: string;
  state: 'open' | 'closed' | null;
}

const SOURCE_RANK: Record<EdgeSource, number> = { api: 3, field: 2, body: 1 };

/**
 * Derives the dependency graph from one page (or the whole board) of
 * `ForgeProjectItem[]`.
 *
 * The ladder, in precedence order, decides which `source` wins a `'blocks'`
 * edge when more than one names the same blocker for the same item:
 * `api` (`content.dependencies.blockedBy`, issue items only) beats `field`
 * (a project field named `blockedByFieldName`, checked for every item
 * regardless of type) beats `body` (`parseBlockerRefs(content.body)`, only
 * ever consulted when `api` and `field` together produced nothing for that
 * item — the lowest-confidence layer is skipped outright once a better one
 * has already answered). `parent`/`subIssues` are a separate, unconditional
 * `'contains'` layer: they never affect `blocked`/`ready`/`unmetBlockerCount`
 * — a parent issue is not blocked by its children.
 */
export function resolveForgeGraph(
  items: ForgeProjectItem[],
  fields: ForgeProjectField[],
  options: ForgeGraphOptions,
): ForgeGraph {
  const { boardRepo } = options;
  const nodeCap = options.nodeCap ?? FORGE_GRAPH_NODE_CAP;
  const fieldName = (options.blockedByFieldName ?? 'Blocked by').trim().toLowerCase();
  const blockedByField = fieldName ? fields.find((f) => f.name.trim().toLowerCase() === fieldName) : undefined;

  const nodes = new Map<string, ForgeGraphNode>();
  const nodeOrder: string[] = [];
  const itemKeyById = new Map<string, string>();

  function registerNode(key: string, node: ForgeGraphNode): void {
    if (nodes.has(key)) return;
    nodes.set(key, node);
    nodeOrder.push(key);
  }

  /** Finds or creates the node a ref points at — folding an `api`/`parent`/
   *  `subIssues` blocker with real `title`/`state` into a placeholder a
   *  `field`/`body` reference to the *same* number already created, and vice
   *  versa, so "known only by number" upgrades to "known" the moment better
   *  data about it turns up, rather than minting a second node. */
  function ensureBlockerNode(ref: { repo: string; number: number; title?: string; state?: 'open' | 'closed' | null }): string {
    const key = keyForNumber(ref.repo, ref.number, boardRepo);
    const existing = nodes.get(key);
    if (existing) {
      if (existing.foreign) {
        if (!existing.title && ref.title) existing.title = ref.title;
        if (existing.state === null && ref.state != null) existing.state = ref.state;
      }
      return key;
    }
    registerNode(key, {
      itemId: '',
      number: ref.number,
      repo: normalizeRepo(ref.repo, boardRepo),
      title: ref.title ?? '',
      // blockedBy/parent/subIssues are Issue-typed connections; a field/body
      // reference with no metadata is assumed to name an issue too — the
      // relation this whole ladder exists to describe.
      kind: 'issue',
      state: ref.state ?? null,
      blocked: false,
      ready: false,
      unmetBlockerCount: 0,
      foreign: true,
      truncated: false,
    });
    return key;
  }

  // Pass 1 — every board item becomes a node, in board order.
  for (const item of items) {
    const content = item.content;
    const number = contentNumber(content);
    const key = content.type === 'draft' ? item.id : keyForNumber('', number as number, boardRepo);
    itemKeyById.set(item.id, key);
    registerNode(key, {
      itemId: item.id,
      number,
      repo: '',
      title: content.title,
      kind: content.type,
      state: contentState(content),
      blocked: false,
      ready: false,
      unmetBlockerCount: 0,
      foreign: false,
      truncated:
        content.type === 'issue' && (content.dependencies.blockedByTruncated || content.dependencies.subIssuesTruncated),
    });
  }

  interface EdgeAcc {
    from: string;
    to: string;
    kind: ForgeGraphEdgeKind;
    source: EdgeSource;
  }
  const edgeMap = new Map<string, EdgeAcc>();

  function addEdge(from: string, to: string, kind: ForgeGraphEdgeKind, source: EdgeSource): void {
    if (from === to) return; // self-edges dropped
    const dedupeKey = `${kind}|${from}|${to}`;
    const existing = edgeMap.get(dedupeKey);
    if (!existing || SOURCE_RANK[source] > SOURCE_RANK[existing.source]) {
      edgeMap.set(dedupeKey, { from, to, kind, source });
    }
  }

  // Pass 2 — the ladder, per item, plus the independent containment layer.
  for (const item of items) {
    const content = item.content;
    const fromKey = itemKeyById.get(item.id)!;

    const apiRefs: CandidateRef[] =
      content.type === 'issue'
        ? content.dependencies.blockedBy.map((link) => ({
            repo: link.repo,
            number: link.number,
            source: 'api' as const,
            title: link.title,
            state: link.state,
          }))
        : [];

    const fieldRefs: CandidateRef[] = [];
    if (blockedByField) {
      const value = item.fieldValues[blockedByField.id];
      const text = value ? fieldValueText(value) : '';
      if (text.trim()) {
        for (const ref of parseBlockerRefs(`Blocked by: ${text}`)) {
          fieldRefs.push({ ...ref, source: 'field', title: '', state: null });
        }
      }
    }

    const bodyRefs: CandidateRef[] =
      apiRefs.length === 0 && fieldRefs.length === 0
        ? parseBlockerRefs(content.body).map((ref) => ({ ...ref, source: 'body' as const, title: '', state: null }))
        : [];

    for (const ref of [...apiRefs, ...fieldRefs, ...bodyRefs]) {
      const toKey = ensureBlockerNode(ref);
      addEdge(fromKey, toKey, 'blocks', ref.source);
    }

    if (content.type === 'issue') {
      if (content.dependencies.parent) {
        const parentKey = ensureBlockerNode(content.dependencies.parent);
        addEdge(parentKey, fromKey, 'contains', 'api');
      }
      for (const sub of content.dependencies.subIssues) {
        const subKey = ensureBlockerNode(sub);
        addEdge(fromKey, subKey, 'contains', 'api');
      }
    }
  }

  const totalCount = nodeOrder.length;
  const truncated = totalCount > nodeCap;
  const keptKeys = nodeOrder.slice(0, nodeCap);
  const keptKeySet = new Set(keptKeys);

  const edges = [...edgeMap.values()].filter((edge) => keptKeySet.has(edge.from) && keptKeySet.has(edge.to));

  // Pass 3 — readiness, from surviving 'blocks' edges only. 'contains' never
  // reaches this: an epic's sub-issues must never grey out the epic itself.
  const blockerCounts = new Map<string, { total: number; unmet: number }>();
  for (const edge of edges) {
    if (edge.kind !== 'blocks') continue;
    const counts = blockerCounts.get(edge.from) ?? { total: 0, unmet: 0 };
    counts.total += 1;
    const blocker = nodes.get(edge.to);
    if (blocker?.state !== 'closed') counts.unmet += 1;
    blockerCounts.set(edge.from, counts);
  }

  const finalNodes = keptKeys.map((key) => {
    const node = nodes.get(key)!;
    const counts = blockerCounts.get(key) ?? { total: 0, unmet: 0 };
    return {
      ...node,
      unmetBlockerCount: counts.unmet,
      blocked: counts.unmet > 0,
      ready: node.state === 'open' && counts.unmet === 0 && counts.total > 0,
    };
  });

  return { nodes: finalNodes, edges, truncated, totalCount, kind: 'ok' };
}

/**
 * Per-layer edge counts, so a zero-edge graph can say *which* of the three
 * `'blocks'` sources came up empty (Theme D's empty state) instead of only
 * that the graph has nothing in it. `'contains'` is counted separately from
 * the `'blocks'` sources it may share a `source: 'api'` tag with.
 */
export function describeGraphSources(graph: ForgeGraph): { api: number; field: number; body: number; contains: number } {
  const counts = { api: 0, field: 0, body: 0, contains: 0 };
  for (const edge of graph.edges) {
    if (edge.kind === 'contains') {
      counts.contains += 1;
    } else {
      counts[edge.source] += 1;
    }
  }
  return counts;
}
