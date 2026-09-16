// Layer: vitest (Phase 82) — pure fs + JSON parsing, no browser capability needed.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { graphExists, readGraph } from './graph-reader';

const VALID_GRAPH = {
  directed: false,
  multigraph: false,
  graph: {},
  nodes: [
    { id: 'a', label: 'A', community: 0, community_name: 'core', file_type: 'code' },
    { id: 'b', label: 'B', community: 1, community_name: 'edge', file_type: 'code' },
  ],
  links: [{ source: 'a', target: 'b', relation: 'calls', weight: 1 }],
  built_at_commit: 'deadbeef',
};

describe('readGraph', () => {
  let repoPath: string;

  beforeEach(async () => {
    repoPath = await mkdtemp(join(tmpdir(), 'knowledge-reader-'));
  });

  afterEach(async () => {
    await rm(repoPath, { recursive: true, force: true });
  });

  it('returns kind "absent" when graphify-out/graph.json does not exist', async () => {
    const result = await readGraph(repoPath);
    expect(result).toEqual({ ok: false, kind: 'absent' });
  });

  it('returns ok:true with the parsed graph when the file is well-formed', async () => {
    await mkdir(join(repoPath, 'graphify-out'), { recursive: true });
    await writeFile(
      join(repoPath, 'graphify-out', 'graph.json'),
      JSON.stringify(VALID_GRAPH),
      'utf8',
    );

    const result = await readGraph(repoPath);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.graph.nodes).toHaveLength(2);
      expect(result.graph.links).toHaveLength(1);
      expect(result.graph.built_at_commit).toBe('deadbeef');
    }
  });

  it('returns kind "malformed" for invalid JSON', async () => {
    await mkdir(join(repoPath, 'graphify-out'), { recursive: true });
    await writeFile(join(repoPath, 'graphify-out', 'graph.json'), '{ not json', 'utf8');

    const result = await readGraph(repoPath);
    expect(result).toMatchObject({ ok: false, kind: 'malformed' });
  });

  it('returns kind "malformed" for valid JSON that is not shaped like a graph', async () => {
    await mkdir(join(repoPath, 'graphify-out'), { recursive: true });
    await writeFile(
      join(repoPath, 'graphify-out', 'graph.json'),
      JSON.stringify({ hello: 'world' }),
      'utf8',
    );

    const result = await readGraph(repoPath);
    expect(result).toMatchObject({ ok: false, kind: 'malformed' });
  });

  it('returns kind "unreadable" when the path exists but is not a readable file', async () => {
    // A directory in place of graph.json fails the read with EISDIR, not ENOENT.
    await mkdir(join(repoPath, 'graphify-out', 'graph.json'), { recursive: true });

    const result = await readGraph(repoPath);
    expect(result).toMatchObject({ ok: false, kind: 'unreadable' });
  });
});

describe('graphExists', () => {
  let repoPath: string;

  beforeEach(async () => {
    repoPath = await mkdtemp(join(tmpdir(), 'knowledge-exists-'));
  });

  afterEach(async () => {
    await rm(repoPath, { recursive: true, force: true });
  });

  it('is false for a repo with no graphify-out/graph.json (Theme F rail greying)', async () => {
    expect(await graphExists(repoPath)).toBe(false);
  });

  it('is true once graph.json is on disk, without parsing it', async () => {
    await mkdir(join(repoPath, 'graphify-out'), { recursive: true });
    // Deliberately invalid JSON — `graphExists` is a `stat`, so a malformed
    // file (which `readGraph` would reject) still answers `true` here. The
    // view someone actually opens is what tells `absent` from `malformed`.
    await writeFile(join(repoPath, 'graphify-out', 'graph.json'), '{ not json', 'utf8');
    expect(await graphExists(repoPath)).toBe(true);
  });

  it('is true even when a directory sits where graph.json should be', async () => {
    await mkdir(join(repoPath, 'graphify-out', 'graph.json'), { recursive: true });
    // Deliberate: `graphExists` answers "is this repo un-graphified", not "is
    // this a valid graph". A directory in the way is a real (if odd) problem
    // — `readGraph` reports it as `unreadable` — but it is not the "never ran
    // graphify" case the rail row greys out for, so the row stays active and
    // the opened view is what surfaces the real error.
    expect(await graphExists(repoPath)).toBe(true);
  });
});
