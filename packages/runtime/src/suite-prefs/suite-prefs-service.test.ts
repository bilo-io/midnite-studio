import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultSuitePrefs, SUITE_PREFS_FILE_NAME, type SuitePrefsSnapshot } from '@midnite/studio-shared';

import { createSuitePrefsService, type SuitePrefsWatchFn } from './suite-prefs-service';

let dir: string;
let warnings: string[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'suite-prefs-'));
  warnings = [];
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(dir, { recursive: true, force: true });
});

function service(extra: Partial<Parameters<typeof createSuitePrefsService>[0]> = {}) {
  return createSuitePrefsService({ directory: dir, warn: (m) => warnings.push(m), ...extra });
}

/** A hand-driven `fs.watch`: `fire()` plays the event a real watcher would deliver. */
function fakeWatch() {
  let listener: ((eventType: string, fileName: string | null) => void) | null = null;
  const closed = vi.fn();
  const watch: SuitePrefsWatchFn = (_directory, l) => {
    listener = l;
    return { close: closed };
  };
  return { watch, closed, fire: (fileName: string | null = SUITE_PREFS_FILE_NAME) => listener?.('rename', fileName) };
}

describe('suite-prefs service — read defaults', () => {
  it('answers every group defaulted, and stores nothing, when there is no file', async () => {
    const snapshot = await service().get();
    expect(snapshot.prefs).toEqual(defaultSuitePrefs());
    expect(snapshot.stored).toEqual([]);
    expect(snapshot.prefs.appearance.accent).toBe('default');
    expect(snapshot.prefs.palette.activePaletteId).toBe('github-dark');
    expect(snapshot.prefs.titlebarStatus.worldClockZones).toHaveLength(4);
  });

  it('fills missing fields of a stored group from defaults, and defaults a group that fails its schema', async () => {
    await writeFile(
      join(dir, SUITE_PREFS_FILE_NAME),
      JSON.stringify({ version: 1, appearance: { accent: 'rose' }, palette: { activePaletteId: 42 } }),
    );
    const snapshot = await service().get();
    expect(snapshot.prefs.appearance).toMatchObject({ accent: 'rose', motion: 'system', effects: { glass: true } });
    expect(snapshot.prefs.palette).toEqual(defaultSuitePrefs().palette);
    expect(snapshot.stored).toEqual(['appearance']);
    expect(warnings).toEqual([]);
  });
});

describe('suite-prefs service — write-merge', () => {
  it('replaces one group and keeps the others the file already held', async () => {
    const svc = service();
    await svc.set({ key: 'appearance', value: { accent: 'blue' } });
    // Another app wrote a different group in between — straight to the file.
    const onDisk = JSON.parse(await readFile(svc.filePath, 'utf8'));
    await writeFile(svc.filePath, JSON.stringify({ ...onDisk, terminal: { showAllApps: true } }));

    const result = await svc.set({ key: 'palette', value: { activePaletteId: 'nord' } });
    expect(result.ok).toBe(true);

    const file = JSON.parse(await readFile(svc.filePath, 'utf8'));
    expect(file.version).toBe(1);
    expect(file.appearance.accent).toBe('blue');
    expect(file.terminal).toEqual({ showAllApps: true });
    expect(file.palette.activePaletteId).toBe('nord');
    const snapshot = await svc.get();
    expect(snapshot.stored.sort()).toEqual(['appearance', 'palette', 'terminal']);
  });

  it('rejects a value that fails its key schema, and an unknown key, without touching the file', async () => {
    const svc = service();
    expect(await svc.set({ key: 'appearance', value: { accent: 'chartreuse' } })).toMatchObject({ ok: false });
    expect(await svc.set({ key: 'secrets', value: {} })).toMatchObject({ ok: false });
    await expect(readFile(svc.filePath, 'utf8')).rejects.toThrow();
  });

  it('serialises concurrent writes so each keeps its own group', async () => {
    const svc = service();
    await Promise.all([
      svc.set({ key: 'appearance', value: { accent: 'amber' } }),
      svc.set({ key: 'companion', value: { enabled: true } }),
      svc.set({ key: 'terminal', value: { showAllApps: true } }),
    ]);
    const { prefs, stored } = await svc.get();
    expect(stored.sort()).toEqual(['appearance', 'companion', 'terminal']);
    expect(prefs.appearance.accent).toBe('amber');
    expect(prefs.companion.enabled).toBe(true);
    expect(prefs.terminal.showAllApps).toBe(true);
  });

  it('leaves no temp file behind', async () => {
    const svc = service();
    await svc.set({ key: 'appearance', value: { accent: 'cyan' } });
    expect(await readdir(dir)).toEqual([SUITE_PREFS_FILE_NAME]);
  });
});

describe('suite-prefs service — corrupt-file recovery', () => {
  it('moves an unparseable file aside, reads defaults, and warns once', async () => {
    await writeFile(join(dir, SUITE_PREFS_FILE_NAME), '{ not json');
    const svc = service({ now: () => 1234 });
    const snapshot = await svc.get();
    expect(snapshot.prefs).toEqual(defaultSuitePrefs());
    expect(snapshot.stored).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(await readdir(dir)).toEqual([`${SUITE_PREFS_FILE_NAME}.bad-1234`]);
    expect(await readFile(join(dir, `${SUITE_PREFS_FILE_NAME}.bad-1234`), 'utf8')).toBe('{ not json');

    // The next read finds no file — no second warning — and a write starts a fresh one.
    await svc.get();
    expect(warnings).toHaveLength(1);
    expect((await svc.set({ key: 'appearance', value: { accent: 'violet' } })).ok).toBe(true);
    expect((await svc.get()).prefs.appearance.accent).toBe('violet');
  });

  it('treats JSON that is not an object as corrupt', async () => {
    await writeFile(join(dir, SUITE_PREFS_FILE_NAME), '[1,2,3]');
    await service({ now: () => 9 }).get();
    expect(await readdir(dir)).toEqual([`${SUITE_PREFS_FILE_NAME}.bad-9`]);
  });
});

describe('suite-prefs service — the change event', () => {
  it('fires on its own write with the new snapshot', async () => {
    const svc = service();
    const seen: SuitePrefsSnapshot[] = [];
    svc.onChanged((s) => seen.push(s));
    await svc.set({ key: 'appearance', value: { accent: 'emerald' } });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.prefs.appearance.accent).toBe('emerald');
    expect(seen[0]?.stored).toEqual(['appearance']);
  });

  it('fires once, debounced, when another process writes the file', async () => {
    const fake = fakeWatch();
    const svc = service({ watch: fake.watch, debounceMs: 20 });
    svc.watch();
    const seen: SuitePrefsSnapshot[] = [];
    svc.onChanged((s) => seen.push(s));

    await writeFile(svc.filePath, JSON.stringify({ version: 1, appearance: { accent: 'orange' } }));
    fake.fire();
    fake.fire();
    fake.fire('suite-prefs.json.tmp-1-abcd');
    fake.fire();
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 60));
    expect(seen).toHaveLength(1);
    expect(seen[0]?.prefs.appearance.accent).toBe('orange');
  });

  it('does not re-announce its own write when the watcher reports it', async () => {
    const fake = fakeWatch();
    const svc = service({ watch: fake.watch, debounceMs: 10 });
    svc.watch();
    const seen: SuitePrefsSnapshot[] = [];
    svc.onChanged((s) => seen.push(s));
    await svc.set({ key: 'appearance', value: { accent: 'blue' } });
    fake.fire();
    await new Promise((r) => setTimeout(r, 50));
    expect(seen).toHaveLength(1);
  });

  it('ignores other files in the directory and stops on close', async () => {
    const fake = fakeWatch();
    const svc = service({ watch: fake.watch, debounceMs: 10 });
    svc.watch();
    const listener = vi.fn();
    svc.onChanged(listener);
    await writeFile(svc.filePath, JSON.stringify({ version: 1, companion: { enabled: true } }));
    fake.fire('loop-runs');
    await new Promise((r) => setTimeout(r, 40));
    expect(listener).not.toHaveBeenCalled();
    svc.close();
    expect(fake.closed).toHaveBeenCalled();
  });

  it('a real fs.watch sees another writer', async () => {
    const svc = service({ debounceMs: 20 });
    svc.watch();
    const seen: SuitePrefsSnapshot[] = [];
    svc.onChanged((s) => seen.push(s));
    const other = service();
    await other.set({ key: 'monitor', value: {} });
    await vi.waitFor(() => expect(seen.at(-1)?.stored).toEqual(['monitor']), { timeout: 3000 });
    svc.close();
  });
});
