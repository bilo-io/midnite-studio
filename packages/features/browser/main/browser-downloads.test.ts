import { describe, expect, it, vi } from 'vitest';

import { createDownloadHandler, type DownloadHandlerDeps, type DownloadItemFull } from './browser-downloads';

function item(over: Partial<{ name: string; size: number }> = {}) {
  const done: Array<(e: unknown, s: 'completed' | 'cancelled' | 'interrupted') => void> = [];
  const it = {
    getFilename: () => over.name ?? 'a.pdf',
    getURL: () => 'https://x.test/a.pdf',
    getTotalBytes: () => over.size ?? 10,
    setSavePath: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
    on: (_e: 'done', l: (e: unknown, s: 'completed' | 'cancelled' | 'interrupted') => void) => void done.push(l),
  } satisfies DownloadItemFull;
  return { it, finish: () => done.forEach((l) => l({}, 'completed')) };
}

function rig(over: Partial<DownloadHandlerDeps> = {}, enabled = true) {
  const onRefused = vi.fn();
  const onDone = vi.fn();
  const deps: DownloadHandlerDeps = {
    getSettings: () => ({ enabled, folder: '' }),
    defaultFolder: '/q',
    quarantine: {
      platform: 'darwin',
      exec: async (file) => ({ code: file === 'clamscan' ? 127 : 0, stdout: '', stderr: '' }),
      sha256File: async () => 'f'.repeat(64),
      appendLedger: async () => undefined,
      now: () => 0,
    },
    ensureFolder: vi.fn(),
    exists: () => false,
    confirm: async () => true,
    pageUrlOf: () => 'https://x.test/',
    onRefused,
    onDone,
    log: () => undefined,
    ...over,
  };
  return { handle: createDownloadHandler(deps), onRefused, onDone, deps };
}

describe('createDownloadHandler', () => {
  it('cancels everything while downloads are off (the default)', () => {
    const { handle, onRefused } = rig({}, false);
    const { it: i } = item();
    handle(i, {});
    expect(i.cancel).toHaveBeenCalled();
    expect(i.setSavePath).not.toHaveBeenCalled();
    expect(onRefused).toHaveBeenCalledWith({}, 'a.pdf');
  });

  it('saves a document straight into the quarantine folder, then finalises and records', async () => {
    const { handle, onDone, deps } = rig();
    const { it: i, finish } = item();
    handle(i, {});
    expect(deps.ensureFolder).toHaveBeenCalledWith('/q');
    expect(i.setSavePath).toHaveBeenCalledWith('/q/a.pdf');
    expect(i.pause).not.toHaveBeenCalled();
    finish();
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onDone.mock.calls[0]![1]).toMatchObject({ sha256: 'f'.repeat(64), path: '/q/a.pdf', quarantined: true });
  });

  it('pauses a risky class until confirmed, then resumes', async () => {
    const { handle } = rig();
    const { it: i } = item({ name: 'Tool.dmg' });
    handle(i, {});
    expect(i.pause).toHaveBeenCalled();
    await vi.waitFor(() => expect(i.resume).toHaveBeenCalled());
  });

  it('cancels when the user declines', async () => {
    const { handle, onRefused } = rig({ confirm: async () => false });
    const { it: i } = item({ name: 'Tool.dmg' });
    handle(i, {});
    await vi.waitFor(() => expect(i.cancel).toHaveBeenCalled());
    expect(i.resume).not.toHaveBeenCalled();
    expect(onRefused).toHaveBeenCalledWith({}, 'Tool.dmg', 'Declined.');
  });

  it('refuses a danger origin before any path is set, with the reason', () => {
    const { handle, onRefused } = rig({ originVerdict: () => 'danger' });
    const { it: i } = item();
    handle(i, {});
    expect(i.setSavePath).not.toHaveBeenCalled();
    expect(onRefused).toHaveBeenCalledWith({}, 'a.pdf', expect.stringContaining('dangerous'));
  });

  it('never saves outside the folder, whatever the server names it', () => {
    const { handle } = rig();
    const { it: i } = item({ name: '../../etc/evil.pdf' });
    handle(i, {});
    expect(i.setSavePath).toHaveBeenCalledWith('/q/evil.pdf');
  });
});
