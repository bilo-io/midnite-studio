import { MUSIC_PPQ, SongSchema, parseAudioProjectFile, parseAudioSidecar, ok } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { createMusicExporter } from './music-export';

const song = SongSchema.parse({
  name: 'Demo',
  tracks: [{ id: 'p', notes: [{ pitch: 60, startTick: 0, durationTicks: MUSIC_PPQ, velocity: 90 }] }],
});
const wav = new Uint8Array([1, 2, 3]);

function harness(over: { pick?: string | null } = {}) {
  const files = new Map<string, Buffer>();
  const writes: Array<{ path: string; data: Buffer }> = [];
  const deps = {
    pickSavePath: vi.fn(async () => (over.pick === undefined ? '/out/Demo.x' : over.pick)),
    writeLocal: vi.fn(async () => undefined),
    transcodeMp3: vi.fn(async (r: { dest: string }) => ok({ dest: r.dest })),
    writeBytes: vi.fn(async (r: { path: string; data: Buffer }) => {
      files.set(r.path, r.data);
      writes.push(r);
      return ok({ size: r.data.length, largeFile: false });
    }),
    readText: vi.fn(async (r: { path: string }) => {
      const f = files.get(r.path);
      return f ? ok(f.toString('utf8')) : { ok: false as const, kind: 'error' as const, message: 'nope' };
    }),
    ensureSong: vi.fn(async () => ok()),
    now: () => new Date(2026, 0, 2, 3, 4, 5),
    mintId: () => 's-1',
  };
  return { exporter: createMusicExporter(deps), deps, files };
}

const base = { repoId: 'r', project: 'album', name: 'Demo', exportId: 'e1', song };

describe('exportSong', () => {
  it('writes the encoded .mid to the picked path', async () => {
    const { exporter, deps } = harness();
    const result = await exporter.exportSong({ ...base, format: 'mid' });
    expect(result).toEqual({ ok: true, value: { dest: '/out/Demo.x' } });
    expect(deps.pickSavePath).toHaveBeenCalledWith(undefined, expect.objectContaining({ defaultName: 'Demo.mid', ext: 'mid' }));
    const [, data] = deps.writeLocal.mock.calls[0] as unknown as [string, Buffer];
    expect(data.subarray(0, 4).toString('latin1')).toBe('MThd');
  });

  it('saves the render as-is for wav and transcodes it for mp3', async () => {
    const { exporter, deps } = harness();
    await exporter.exportSong({ ...base, format: 'wav', wav });
    expect(deps.writeLocal).toHaveBeenCalledWith('/out/Demo.x', Buffer.from(wav));
    await exporter.exportSong({ ...base, format: 'mp3', wav, bitrateKbps: 256 });
    expect(deps.transcodeMp3).toHaveBeenCalledWith(expect.objectContaining({ dest: '/out/Demo.x', bitrateKbps: 256 }));
  });

  it('refuses a wav export with no render and reports a dismissed dialog as cancelled', async () => {
    expect(await harness().exporter.exportSong({ ...base, format: 'wav' })).toMatchObject({ ok: false });
    expect(await harness({ pick: null }).exporter.exportSong({ ...base, format: 'mid' })).toMatchObject({ ok: false, message: 'cancelled' });
  });
});

describe('sendToGenerator', () => {
  it('lands the reference with a sidecar linking back to the song and records a session', async () => {
    const { exporter, files, deps } = harness();
    const result = await exporter.sendToGenerator({ repoId: 'r', project: 'album', name: 'Demo', song, wav, durationS: 12.4 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(deps.ensureSong).toHaveBeenCalledWith('r', 'album', 'Demo', song);
    expect(result.value.file).toBe('demo-reference-20260102-030405.wav');
    const sidecar = parseAudioSidecar(files.get('demo-reference-20260102-030405.json')?.toString('utf8') ?? '');
    expect(sidecar).toMatchObject({ provider: 'import', fromSong: { project: 'album', name: 'Demo' }, durationS: 12.4 });
    expect(sidecar?.description).toBe(result.value.description);
    const history = parseAudioProjectFile(files.get('project.json')?.toString('utf8'));
    expect(history.sessions).toHaveLength(1);
    expect(history.sessions[0]).toMatchObject({ kind: 'import', variants: [result.value.file] });
    expect(history.sessions[0]!.prompt.musicPrompt).toBe(result.value.description);
  });
});
