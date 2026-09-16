import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { RawGraph, RawGraphLink, RawGraphNode, ReadGraphResult } from './types';

/** Where graphify writes its output, relative to a repo root. Never written by this package. */
export const GRAPHIFY_OUTPUT_RELATIVE_PATH = 'graphify-out/graph.json';

function isRawGraphNode(value: unknown): value is RawGraphNode {
  if (typeof value !== 'object' || value === null) return false;
  const node = value as Record<string, unknown>;
  return (
    typeof node.id === 'string' &&
    typeof node.label === 'string' &&
    typeof node.community === 'number' &&
    typeof node.community_name === 'string' &&
    typeof node.file_type === 'string'
  );
}

function isRawGraphLink(value: unknown): value is RawGraphLink {
  if (typeof value !== 'object' || value === null) return false;
  const link = value as Record<string, unknown>;
  return (
    typeof link.source === 'string' &&
    typeof link.target === 'string' &&
    typeof link.relation === 'string' &&
    // `weight` is genuinely optional — see RawGraphLink's own doc comment.
    (link.weight === undefined || typeof link.weight === 'number')
  );
}

/**
 * Structural validation only — not a full zod schema. `graph.json` is
 * graphify's own output, produced by a separate tool this app never invokes
 * (Decision 4), so the contract here is "shaped enough to project and lay
 * out", not "matches a schema we control."
 */
function isRawGraph(value: unknown): value is RawGraph {
  if (typeof value !== 'object' || value === null) return false;
  const graph = value as Record<string, unknown>;
  return (
    Array.isArray(graph.nodes) &&
    Array.isArray(graph.links) &&
    typeof graph.built_at_commit === 'string' &&
    graph.nodes.every(isRawGraphNode) &&
    graph.links.every(isRawGraphLink)
  );
}

/**
 * Resolve `<repo>/graphify-out/graph.json`, parse it, and return a
 * discriminated result — never throws.
 *
 * Absent (`ENOENT`) is the common, un-graphified-repo case and is
 * distinguished from `unreadable` (exists but couldn't be read — permissions,
 * a directory in its place) and `malformed` (valid JSON that isn't shaped
 * like a graphify graph, or invalid JSON) — Theme F renders each state with
 * different copy because each has a different fix.
 */
export async function readGraph(repoPath: string): Promise<ReadGraphResult> {
  const path = join(repoPath, GRAPHIFY_OUTPUT_RELATIVE_PATH);

  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { ok: false, kind: 'absent' };
    return {
      ok: false,
      kind: 'unreadable',
      message: err instanceof Error ? err.message : String(err),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      kind: 'malformed',
      message: `graph.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!isRawGraph(parsed)) {
    return {
      ok: false,
      kind: 'malformed',
      message: 'graph.json is valid JSON but not shaped like a graphify graph.',
    };
  }

  return { ok: true, graph: parsed };
}
