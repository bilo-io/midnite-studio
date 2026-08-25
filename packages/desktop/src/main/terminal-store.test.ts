import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SCROLLBACK_BYTES, type TerminalSession } from '@midnite/git-shared';
import { afterEach, describe, expect, it } from 'vitest';

import { createTerminalStore, parseStoredSessions, trimScrollback } from './terminal-store';

let dirs: string[] = [];

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mgit-terminals-'));
  dirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  dirs = [];
});

const session = (over: Partial<TerminalSession> = {}): TerminalSession => ({
  id: 'sess-1',
  kind: 'shell',
  title: 'midnite',
  cwd: '/Users/x/Dev/midnite',
  repoId: 'repo:/Users/x/Dev/midnite',
  createdAt: 1_700_000_000_000,
  ...over,
});

describe('createTerminalStore', () => {
  it('round-trips the session list in order', async () => {
    const store = createTerminalStore(await tempDir());
    const rows = [session(), session({ id: 'sess-2', kind: 'agent', agentId: 'claude' })];

    await store.save(rows);
    expect(await store.load()).toEqual(rows);
  });

  it('returns no sessions on first launch', async () => {
    expect(await createTerminalStore(await tempDir()).load()).toEqual([]);
  });

  it('starts empty rather than throwing on a corrupt file', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'terminals.json'), '{ not json', 'utf8');
    expect(await createTerminalStore(dir).load()).toEqual([]);
  });

  it('round-trips scrollback bytes', async () => {
    const store = createTerminalStore(await tempDir());
    const bytes = encode('$ git status\r\nnothing to commit\r\n');

    await store.writeScrollback('sess-1', bytes);
    expect(await store.readScrollback('sess-1')).toEqual(bytes);
  });

  it('reads an unknown session as empty scrollback, not an error', async () => {
    const store = createTerminalStore(await tempDir());
    expect(await store.readScrollback('never-existed')).toEqual(new Uint8Array(0));
  });

  it('forgets a session, dropping its log', async () => {
    const store = createTerminalStore(await tempDir());
    await store.writeScrollback('sess-1', encode('output'));

    await store.forget('sess-1');
    expect(await store.readScrollback('sess-1')).toEqual(new Uint8Array(0));
  });

  /**
   * An id crosses IPC and is interpolated into a path. Ids are UUIDs today,
   * which is exactly why this needs a test — the guard protects against a later
   * feature (named or imported sessions) making them user-controlled.
   */
  it('sanitises an id so it cannot escape the scrollback directory', async () => {
    const dir = await tempDir();
    const store = createTerminalStore(dir);

    await store.writeScrollback('../../escaped', encode('x'));

    // Landed inside, under a flattened name — not two directories up.
    await expect(rm(join(dir, 'scrollback', '______escaped.bin'))).resolves.toBeUndefined();
  });
});

describe('parseStoredSessions', () => {
  it('drops rows that are not sessions, keeping the rest', () => {
    const good = session();
    const rows = [good, { id: 'x' }, null, 'nope', { ...good, kind: 'other' }];

    expect(parseStoredSessions({ sessions: rows })).toEqual([good]);
  });

  it('returns nothing for a shape it does not recognise', () => {
    expect(parseStoredSessions(null)).toEqual([]);
    expect(parseStoredSessions({})).toEqual([]);
    expect(parseStoredSessions({ sessions: 'no' })).toEqual([]);
  });
});

describe('trimScrollback', () => {
  it('leaves a buffer under the cap alone', () => {
    const bytes = encode('short\n');
    expect(trimScrollback(bytes)).toBe(bytes);
  });

  /**
   * The load-bearing one. Cutting raw pty bytes at an arbitrary offset lands
   * mid-escape-sequence often enough to matter, and xterm then reads the rest of
   * the buffer as parameters to a CSI that never terminates — the visible
   * symptom being a pane painted one solid colour.
   */
  it('cuts at a newline boundary, never mid-line', () => {
    const trimmed = decode(trimScrollback(encode('aaaa\nbbbb\ncccc\ndddd\n'), 10));

    expect(stripReset(trimmed)).toBe('cccc\ndddd\n');
  });

  it('prefixes the replay with a reset so discarded colour cannot leak', () => {
    const bytes = encode(`\x1b[31m${'x'.repeat(50)}\nplain\n`);

    expect(decode(trimScrollback(bytes, 8)).startsWith(RESET)).toBe(true);
  });

  it('still truncates a single line with no newline to cut at', () => {
    const trimmed = trimScrollback(encode('y'.repeat(100)), 10);

    expect(stripReset(decode(trimmed))).toBe('y'.repeat(10));
  });

  it('defaults to the shared cap', () => {
    const bytes = new Uint8Array(SCROLLBACK_BYTES + 1_000).fill(0x0a);

    // The reset prefix is the only thing allowed above the cap.
    expect(trimScrollback(bytes).length).toBeLessThanOrEqual(SCROLLBACK_BYTES + 4);
  });
});

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
const RESET = '\x1b[0m';
/** Drop the reset prefix `trimScrollback` adds, so assertions read as the text. */
const stripReset = (text: string): string =>
  text.startsWith(RESET) ? text.slice(RESET.length) : text;
