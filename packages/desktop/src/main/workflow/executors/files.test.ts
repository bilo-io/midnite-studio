import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WORKFLOW_FILE_MAX_BYTES, type WorkflowNode } from '@midnite/studio-shared';

import type { ExecutorContext } from '../executor-registry';
import { createReadFileExecutor, createWriteFileExecutor, resolveWorkflowPath } from './files';

/** Real files, in a throwaway temp directory — the executors are thin enough that faking `fs` would test the fake. */

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mstudio-wf-files-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function context(upstream: Record<string, unknown> = {}): ExecutorContext {
  return {
    upstream,
    signal: { cancelled: () => false },
    timeoutMs: 5_000,
    workflowId: 'w',
    runId: 'r',
    reportSessionId: async () => {},
    reportWaiting: async () => {},
  };
}

function readNode(path: string, format: 'text' | 'json' = 'text'): WorkflowNode {
  return { id: 'rd', label: 'Read', x: 0, y: 0, kind: 'read-file', config: { path, format } };
}

function writeNode(path: string, content: string, mode: 'overwrite' | 'append' = 'overwrite'): WorkflowNode {
  return { id: 'wr', label: 'Write', x: 0, y: 0, kind: 'write-file', config: { path, content, mode } };
}

describe('resolveWorkflowPath', () => {
  it('expands ~, requires an absolute path, and refuses .git segments', () => {
    expect(resolveWorkflowPath('~/a.txt', '/home/u')).toEqual({ ok: true, path: '/home/u/a.txt' });
    expect(resolveWorkflowPath('/x/../y', '/home/u')).toEqual({ ok: true, path: '/y' });
    expect(resolveWorkflowPath('rel/a.txt', '/home/u').ok).toBe(false);
    expect(resolveWorkflowPath('/repo/.git/config', '/home/u')).toEqual({
      ok: false,
      error: 'Paths inside a .git directory are off limits.',
    });
    expect(resolveWorkflowPath('   ', '/home/u')).toEqual({ ok: false, error: 'This step has no path.' });
  });
});

describe('the read-file executor', () => {
  it('reads text, and parses JSON when asked', async () => {
    await writeFile(join(dir, 'a.json'), '{"v":[1,2]}');
    const read = createReadFileExecutor();
    expect(await read(readNode(join(dir, 'a.json')), context())).toEqual({
      ok: true,
      output: { path: join(dir, 'a.json'), text: '{"v":[1,2]}', bytes: 11 },
    });
    const parsed = await read(readNode(join(dir, 'a.json'), 'json'), context());
    expect(parsed.ok && parsed.output).toMatchObject({ json: { v: [1, 2] } });
  });

  it('interpolates the path and resolves ~ against the injected home', async () => {
    await writeFile(join(dir, 'b.txt'), 'hello');
    const read = createReadFileExecutor({ home: () => dir });
    const outcome = await read(readNode('~/{{s.name}}'), context({ s: { name: 'b.txt' } }));
    expect(outcome.ok && outcome.output).toMatchObject({ text: 'hello' });
  });

  it('names a missing file, a directory, invalid JSON and an oversized file', async () => {
    const read = createReadFileExecutor();
    expect(await read(readNode(join(dir, 'none.txt')), context())).toEqual({
      ok: false,
      error: `${join(dir, 'none.txt')} does not exist.`,
    });
    expect(await read(readNode(dir), context())).toEqual({ ok: false, error: `${dir} is not a file.` });
    await writeFile(join(dir, 'bad.json'), '{nope');
    expect(await read(readNode(join(dir, 'bad.json'), 'json'), context())).toEqual({
      ok: false,
      error: `${join(dir, 'bad.json')} is not valid JSON.`,
    });
    await writeFile(join(dir, 'big.txt'), 'x'.repeat(WORKFLOW_FILE_MAX_BYTES + 1));
    const big = await read(readNode(join(dir, 'big.txt')), context());
    expect(!big.ok && big.error).toContain('over the');
  });
});

describe('the write-file executor', () => {
  it('writes, overwrites and appends interpolated content', async () => {
    const write = createWriteFileExecutor();
    const target = join(dir, 'out.md');
    expect(await write(writeNode(target, '# {{r.title}}\n'), context({ r: { title: 'Hi' } }))).toEqual({
      ok: true,
      output: { path: target, bytes: 5, mode: 'overwrite' },
    });
    await write(writeNode(target, 'second\n', 'append'), context());
    expect(await readFile(target, 'utf8')).toBe('# Hi\nsecond\n');
    await write(writeNode(target, 'fresh'), context());
    expect(await readFile(target, 'utf8')).toBe('fresh');
  });

  it('refuses a missing parent folder rather than creating it', async () => {
    const write = createWriteFileExecutor();
    const outcome = await write(writeNode(join(dir, 'nope', 'out.txt'), 'x'), context());
    expect(outcome).toEqual({ ok: false, error: `${join(dir, 'nope')} does not exist — create the folder first.` });
  });

  it('never writes through a symlink', async () => {
    const real = join(dir, 'real.txt');
    const link = join(dir, 'link.txt');
    await writeFile(real, 'untouched');
    await symlink(real, link);
    const outcome = await createWriteFileExecutor()(writeNode(link, 'pwned'), context());
    expect(outcome).toEqual({ ok: false, error: `${link} is a symlink — not written through.` });
    expect(await readFile(real, 'utf8')).toBe('untouched');
  });

  it('refuses a .git path before touching the disk', async () => {
    const outcome = await createWriteFileExecutor()(writeNode(join(dir, '.git', 'config'), 'x'), context());
    expect(outcome).toEqual({ ok: false, error: 'Paths inside a .git directory are off limits.' });
  });
});
