import { mkdir, mkdtemp, realpath, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { SpawnedProcess, SpawnFn } from './process-runner';
import { computeTrashSummary, EMPTY_TRASH_ARGS, emptyTrash } from './trash-service';

const FAKE_UID = 501;

describe('computeTrashSummary', () => {
  let home: string;
  let volumesDir: string;

  beforeAll(async () => {
    home = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-trash-home-')));
    volumesDir = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-trash-volumes-')));
  });

  afterAll(async () => {
    await rm(home, { recursive: true, force: true });
    await rm(volumesDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    // Fresh Trash + volumes each test — every test builds only the fixture it needs.
    await rm(join(home, '.Trash'), { recursive: true, force: true });
    for (const entry of ['disk1', 'disk2', 'boot-symlink']) {
      await rm(join(volumesDir, entry), { recursive: true, force: true });
    }
  });

  it('a missing ~/.Trash yields a zeroed summary without throwing', async () => {
    const summary = await computeTrashSummary({
      signal: new AbortController().signal,
      home,
      volumesDir,
      uid: FAKE_UID,
    });
    expect(summary).toEqual({
      itemCount: 0,
      totalBytes: 0,
      oldestModifiedAt: null,
      volumeCount: 0,
      truncated: false,
    });
  });

  it('counts three known files and sums their sizes', async () => {
    await mkdir(join(home, '.Trash'), { recursive: true });
    await writeFile(join(home, '.Trash', 'a.txt'), 'a'.repeat(10));
    await writeFile(join(home, '.Trash', 'b.txt'), 'b'.repeat(20));
    await writeFile(join(home, '.Trash', 'c.txt'), 'c'.repeat(30));

    const summary = await computeTrashSummary({
      signal: new AbortController().signal,
      home,
      volumesDir,
      uid: FAKE_UID,
    });

    expect(summary.itemCount).toBe(3);
    expect(summary.totalBytes).toBe(60);
    expect(summary.volumeCount).toBe(1);
  });

  it('counts a nested directory as one item while totalBytes includes its contents', async () => {
    await mkdir(join(home, '.Trash', 'a-folder'), { recursive: true });
    await writeFile(join(home, '.Trash', 'a-folder', 'inner.txt'), 'x'.repeat(15));

    const summary = await computeTrashSummary({
      signal: new AbortController().signal,
      home,
      volumesDir,
      uid: FAKE_UID,
    });

    expect(summary.itemCount).toBe(1);
    expect(summary.totalBytes).toBe(15);
  });

  it('oldestModifiedAt is the earliest mtime, as an ISO string', async () => {
    await mkdir(join(home, '.Trash'), { recursive: true });
    await writeFile(join(home, '.Trash', 'old.txt'), 'x');
    await writeFile(join(home, '.Trash', 'new.txt'), 'x');
    const old = new Date('2020-01-01T00:00:00.000Z');
    const recent = new Date('2024-01-01T00:00:00.000Z');
    await utimes(join(home, '.Trash', 'old.txt'), old, old);
    await utimes(join(home, '.Trash', 'new.txt'), recent, recent);

    const summary = await computeTrashSummary({
      signal: new AbortController().signal,
      home,
      volumesDir,
      uid: FAKE_UID,
    });

    expect(summary.oldestModifiedAt).toBe(old.toISOString());
  });

  it('discovers a mounted volume\'s own Trash for this uid — volumeCount 2', async () => {
    await mkdir(join(home, '.Trash'), { recursive: true });
    await mkdir(join(volumesDir, 'disk1', '.Trashes', String(FAKE_UID)), { recursive: true });
    await writeFile(join(volumesDir, 'disk1', '.Trashes', String(FAKE_UID), 'd.txt'), 'd'.repeat(5));

    const summary = await computeTrashSummary({
      signal: new AbortController().signal,
      home,
      volumesDir,
      uid: FAKE_UID,
    });

    expect(summary.volumeCount).toBe(2);
    expect(summary.itemCount).toBe(1);
    expect(summary.totalBytes).toBe(5);
  });

  it('excludes a volume whose .Trashes has no subdirectory for this uid', async () => {
    await mkdir(join(home, '.Trash'), { recursive: true });
    await mkdir(join(volumesDir, 'disk2', '.Trashes', '999'), { recursive: true });

    const summary = await computeTrashSummary({
      signal: new AbortController().signal,
      home,
      volumesDir,
      uid: FAKE_UID,
    });

    expect(summary.volumeCount).toBe(1);
  });

  it('skips a symlink in /Volumes (the boot-volume convention) — no double count', async () => {
    await mkdir(join(home, '.Trash'), { recursive: true });
    await writeFile(join(home, '.Trash', 'a.txt'), 'a'.repeat(10));
    await symlink(home, join(volumesDir, 'boot-symlink'));

    const summary = await computeTrashSummary({
      signal: new AbortController().signal,
      home,
      volumesDir,
      uid: FAKE_UID,
    });

    expect(summary.volumeCount).toBe(1);
    expect(summary.totalBytes).toBe(10);
  });

  it('a symlink inside .Trash adds zero bytes and is not followed', async () => {
    await mkdir(join(home, '.Trash'), { recursive: true });
    const bigTargetDir = await mkdtemp(join(tmpdir(), 'mstudio-trash-symlink-target-'));
    await writeFile(join(bigTargetDir, 'huge.bin'), 'x'.repeat(1_000));
    await symlink(bigTargetDir, join(home, '.Trash', 'link-to-elsewhere'));

    try {
      const summary = await computeTrashSummary({
        signal: new AbortController().signal,
        home,
        volumesDir,
        uid: FAKE_UID,
      });

      expect(summary.itemCount).toBe(1);
      expect(summary.totalBytes).toBe(0);
    } finally {
      await rm(bigTargetDir, { recursive: true, force: true });
    }
  });

  it('an already-aborted signal returns promptly with zeroed totals', async () => {
    await mkdir(join(home, '.Trash'), { recursive: true });
    await writeFile(join(home, '.Trash', 'a.txt'), 'a'.repeat(10));

    const controller = new AbortController();
    controller.abort();

    const summary = await computeTrashSummary({
      signal: controller.signal,
      home,
      volumesDir,
      uid: FAKE_UID,
    });

    expect(summary).toEqual({
      itemCount: 0,
      totalBytes: 0,
      oldestModifiedAt: null,
      volumeCount: 0,
      truncated: false,
    });
  });

  it('truncated becomes true once the shared entry budget is exceeded', async () => {
    await mkdir(join(home, '.Trash'), { recursive: true });
    await writeFile(join(home, '.Trash', 'a.txt'), 'a');
    await writeFile(join(home, '.Trash', 'b.txt'), 'b');
    await writeFile(join(home, '.Trash', 'c.txt'), 'c');

    vi.resetModules();
    vi.doMock('./optimizer/scan-service', async (importOriginal) => {
      const actual = await importOriginal<typeof import('./optimizer/scan-service')>();
      return { ...actual, MAX_WALK_ENTRIES: 2 };
    });

    try {
      const { computeTrashSummary: computeWithSmallBudget } = await import('./trash-service');
      const summary = await computeWithSmallBudget({
        signal: new AbortController().signal,
        home,
        volumesDir: await mkdtemp(join(tmpdir(), 'mstudio-trash-empty-volumes-')),
        uid: FAKE_UID,
      });
      expect(summary.truncated).toBe(true);
    } finally {
      vi.doUnmock('./optimizer/scan-service');
      vi.resetModules();
    }
  });
});

/** A child process that talks back on command — the `diagnostics/runner.test.ts` idiom. */
function fakeChild() {
  const handlers: {
    stdout: ((c: string) => void)[];
    stderr: ((c: string) => void)[];
    error: ((e: NodeJS.ErrnoException) => void)[];
    close: ((c: number | null) => void)[];
  } = { stdout: [], stderr: [], error: [], close: [] };
  const kill = vi.fn();

  const process: SpawnedProcess = {
    onStdout: (h) => handlers.stdout.push(h),
    onStderr: (h) => handlers.stderr.push(h),
    onError: (h) => handlers.error.push(h),
    onClose: (h) => handlers.close.push(h),
    kill,
  };

  return {
    process,
    kill,
    stderr: (chunk: string) => handlers.stderr.forEach((h) => h(chunk)),
    emitError: (error: NodeJS.ErrnoException) => handlers.error.forEach((h) => h(error)),
    close: (code: number | null = 0) => handlers.close.forEach((h) => h(code)),
  };
}

describe('emptyTrash', () => {
  it('spawns osascript with the literal, module-constant argv — exactly once', async () => {
    const child = fakeChild();
    const spawn = vi.fn<SpawnFn>(() => child.process);

    const promise = emptyTrash({ spawn });
    child.close(0);
    const result = await promise;

    expect(result).toEqual({ ok: true });
    expect(spawn).toHaveBeenCalledWith('osascript', [...EMPTY_TRASH_ARGS], expect.any(String));
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('two separate calls spawn identical argv', async () => {
    const first = fakeChild();
    const spawnFirst = vi.fn<SpawnFn>(() => first.process);
    const p1 = emptyTrash({ spawn: spawnFirst });
    first.close(0);
    await p1;

    const second = fakeChild();
    const spawnSecond = vi.fn<SpawnFn>(() => second.process);
    const p2 = emptyTrash({ spawn: spawnSecond });
    second.close(0);
    await p2;

    expect(spawnFirst.mock.calls[0]?.[1]).toEqual(spawnSecond.mock.calls[0]?.[1]);
  });

  it('a non-zero exit is a failure even though runProcess reports ok:true, with empty stderr', async () => {
    const child = fakeChild();
    const promise = emptyTrash({ spawn: () => child.process });
    child.close(1);

    const result = await promise;
    expect(result).toEqual({ ok: false, message: 'Finder could not empty the Trash: unknown error' });
  });

  it('maps -1743 (automation not authorized)', async () => {
    const child = fakeChild();
    const promise = emptyTrash({ spawn: () => child.process });
    child.stderr('execution error: Not authorized to send Apple events to Finder. (-1743)');
    child.close(1);

    const result = await promise;
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/isn't allowed to control Finder/);
  });

  it('maps -128 (user cancelled) to a non-error message', async () => {
    const child = fakeChild();
    const promise = emptyTrash({ spawn: () => child.process });
    child.stderr('execution error: User canceled. (-128)');
    child.close(1);

    const result = await promise;
    expect(result).toEqual({ ok: false, message: 'Cancelled in Finder — nothing was deleted.' });
  });

  it('maps -600 (Finder not running)', async () => {
    const child = fakeChild();
    const promise = emptyTrash({ spawn: () => child.process });
    child.stderr('execution error: Finder got an error. (-600)');
    child.close(1);

    const result = await promise;
    expect(result).toEqual({ ok: false, message: "Finder didn't respond. Open Finder and try again." });
  });

  it('an unrecognised stderr trace surfaces only its first line, prefixed', async () => {
    const child = fakeChild();
    const promise = emptyTrash({ spawn: () => child.process });
    child.stderr('some weird AppleScript trace\nsecond line\nthird line');
    child.close(1);

    const result = await promise;
    expect(result).toEqual({
      ok: false,
      message: 'Finder could not empty the Trash: some weird AppleScript trace',
    });
  });

  it('a timed-out outcome reports that Finder was not stopped', async () => {
    const spawn = vi.fn<SpawnFn>(() => ({
      onStdout: () => {},
      onStderr: () => {},
      onError: () => {},
      onClose: () => {},
      kill: vi.fn(),
    }));

    const result = await emptyTrash({ spawn, timeoutMs: 5 });
    expect(result).toEqual({
      ok: false,
      message:
        'Finder is still emptying the Trash. Midnite Studio stopped waiting; it did not stop Finder — check the Trash in a moment.',
    });
  });
});

describe('trash-service.ts source', () => {
  it('never issues a permanent-delete syscall — no rm/rmdir/unlink/trashItem', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(join(__dirname, 'trash-service.ts'), 'utf8');
    expect(source).not.toMatch(/\brm\(|\brmdir\(|\bunlink\(|trashItem/);
  });
});
