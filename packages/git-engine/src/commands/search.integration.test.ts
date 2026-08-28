import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import type { Commit, GrepHit } from '@midnite/git-shared';
import { TempRepo } from '../testing/temp-repo';
import { buildLogArgs } from './log';
import { streamCommitSearch } from './search';
import { buildGrepArgs, readGrep, streamGrep } from './grep';
import { readBlame } from './blame';

describe('search, grep, blame integration', () => {

  it('buildLogArgs preserves byte identity for existing callers', () => {
    const defaultArgs = buildLogArgs();
    expect(defaultArgs).toEqual([
      'log',
      '--topo-order',
      '--decorate=full',
      '--pretty=format:%H%x00%P%x00%an%x00%ae%x00%at%x00%ct%x00%D%x00%s',
      '-z',
    ]);

    const optsArgs = buildLogArgs({ all: true, limit: 50, revisions: ['main'] });
    expect(optsArgs).toEqual([
      'log',
      '--topo-order',
      '--decorate=full',
      '--pretty=format:%H%x00%P%x00%an%x00%ae%x00%at%x00%ct%x00%D%x00%s',
      '-z',
      '--all',
      '-n50',
      'main',
    ]);
  });

  it('buildGrepArgs places rev before -- and builds flags in order', () => {
    const args = buildGrepArgs({
      pattern: 'foo',
      rev: 'v1.2.0',
      paths: ['src'],
      ignoreCase: true,
      regexp: true,
      wordMatch: true,
      contextLines: 2,
    });
    expect(args).toEqual([
      'grep',
      '-z',
      '-n',
      '-I',
      '--no-color',
      '-i',
      '-E',
      '-w',
      '-C2',
      '-e',
      'foo',
      'v1.2.0',
      '--',
      'src',
    ]);
    expect(args.slice(-5, -1)).toEqual(['-e', 'foo', 'v1.2.0', '--']);
  });


  it('searches commits by message, author, pickaxe, path', async () => {
    const repo = await TempRepo.create();
    await repo.writeFile('file1.txt', 'hello world\n');
    await repo.git(['add', '-A']);
    await repo.commit('feat: add hello', { author: 'Alice <alice@example.com>' });
    await repo.writeFile('file2.txt', 'const x = 42;\n');
    await repo.git(['add', '-A']);
    await repo.commit('feat: add number', { author: 'Bob <bob@example.com>' });
    await repo.writeFile('file1.txt', 'hello world updated\n');
    await repo.git(['add', '-A']);
    await repo.commit('fix: update hello', { author: 'Alice <alice@example.com>' });

    // Stream search
    const commits: Commit[] = [];
    const stream = streamCommitSearch(
      repo.path,
      { grep: ['hello'] },
      (batch) => commits.push(...batch),
    );
    const done = await stream.done;
    expect(done.total).toBe(2);
    expect(commits.map((c) => c.subject)).toEqual(['fix: update hello', 'feat: add hello']);

    // Author search
    const bobCommits: Commit[] = [];
    const bobStream = streamCommitSearch(
      repo.path,
      { author: ['Bob'] },
      (batch) => bobCommits.push(...batch),
    );
    await bobStream.done;
    expect(bobCommits).toHaveLength(1);
    expect(bobCommits[0]?.authorName).toBe('Bob');

    // Pickaxe search (-S)
    const pickaxeCommits: Commit[] = [];
    const pickaxeStream = streamCommitSearch(
      repo.path,
      { pickaxeString: '42' },
      (batch) => pickaxeCommits.push(...batch),
    );
    await pickaxeStream.done;
    expect(pickaxeCommits).toHaveLength(1);
    expect(pickaxeCommits[0]?.subject).toBe('feat: add number');

    // Follow throw check
    expect(() => buildLogArgs({ follow: true, paths: ['a', 'b'] })).toThrow(
      '--follow requires exactly one pathspec',
    );
  });

  it('executes grep and blame across tricky edge cases (empty, spaces, binary, CRLF, -pattern)', async () => {
    const repo = await TempRepo.create();
    await repo.writeFile('src/café notes.md', 'some notes\n-Wall flag here\n');
    await repo.writeFile('crlf.txt', 'line 1\r\nline 2 with -Wall\r\n');
    // Binary file
    await fs.writeFile(path.join(repo.path, 'image.png'), Buffer.from([0, 1, 2, 3, 255, 0]));
    await repo.git(['add', '-A']);
    await repo.commit('init commit');


    // Grep with pattern starting with '-'
    const hits = await readGrep(repo.path, {
      pattern: '-Wall',
      ignoreCase: false,
      regexp: false,
      wordMatch: false,
      contextLines: 0,
    });
    expect(hits.ok).toBe(true);
    const matches = hits.ok ? hits.matches : [];
    expect(matches.length).toBe(2);
    const cafeHit = matches.find((h) => h.path.includes('café notes.md'));
    expect(cafeHit).toBeDefined();
    expect(cafeHit?.text).toBe('-Wall flag here');

    const crlfHit = matches.find((h) => h.path === 'crlf.txt');
    expect(crlfHit?.text).toBe('line 2 with -Wall'); // CRLF \r stripped


    // Grep stream
    const streamHits: GrepHit[] = [];
    const grepStream = streamGrep(
      repo.path,
      {
        pattern: 'notes',

        ignoreCase: false,
        regexp: false,
        wordMatch: false,
        contextLines: 0,
      },
      (batch) => streamHits.push(...batch),
    );
    const grepDone = await grepStream.done;
    expect(grepDone.total).toBe(1);
    expect(streamHits[0]?.path).toBe('src/café notes.md');


    // Blame
    const blameRes = await readBlame(repo.path, { relPath: 'src/café notes.md' });
    expect(blameRes.ok).toBe(true);
    if (blameRes.ok) {
      expect(blameRes.value.lines).toHaveLength(2);
      expect(blameRes.value.lines[0]?.text).toBe('some notes');
    }
  });
});
