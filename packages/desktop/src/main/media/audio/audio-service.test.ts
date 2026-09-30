import { ok, parseAudioProjectFile, parseAudioSidecar, type AudioImportRequest } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { audioSlug, createAudioService } from './audio-service';
import { importAudioProvider } from './import-adapter';

function harness(existing: Record<string, string> = {}) {
  const written = new Map<string, Buffer>(Object.entries(existing).map(([k, v]) => [k, Buffer.from(v)]));
  const events: string[] = [];
  const service = createAudioService({
    providers: { import: importAudioProvider },
    writeBytes: async ({ path, data }) => {
      written.set(path, data);
      return ok({ size: data.length, largeFile: false });
    },
    readText: async ({ path }) => {
      const data = written.get(path);
      return data ? ok(data.toString('utf8')) : { ok: false, kind: 'error', message: 'File not found.' };
    },
    readFile: async (abs) => Buffer.from(`bytes of ${abs}`),
    emit: (event) => events.push(`${event.status}:${event.completed}/${event.total}`),
    now: () => new Date(2026, 8, 30, 14, 15, 2),
    mintId: () => 'sess-1',
  });
  return { service, written, events };
}

const req: AudioImportRequest = {
  importId: 'imp-1',
  repoId: 'r1',
  project: 'album',
  prompt: { title: '', style: ['lofi'], lyrics: '', instrumental: true, durationS: 120, count: 2 },
};

describe('audio service — import adapter', () => {
  it('copies each pick in, writes a sidecar beside it and appends one session', async () => {
    const { service, written, events } = harness();
    const result = await service.importFiles(req, ['/Users/me/Take One.wav', '/tmp/b.MP3']);

    expect(result).toEqual({
      ok: true,
      value: { sessionId: 'sess-1', files: ['take-one-20260930-141502-1.wav', 'b-20260930-141502-2.mp3'] },
    });
    expect(written.get('take-one-20260930-141502-1.wav')?.toString()).toBe('bytes of /Users/me/Take One.wav');

    const sidecar = parseAudioSidecar(written.get('take-one-20260930-141502-1.json')!.toString());
    expect(sidecar).toMatchObject({
      version: 1,
      file: 'take-one-20260930-141502-1.wav',
      sessionId: 'sess-1',
      provider: 'import',
      title: 'Take One',
      source: 'Take One.wav',
    });

    const history = parseAudioProjectFile(written.get('project.json')!.toString());
    expect(history.sessions).toHaveLength(1);
    expect(history.sessions[0]).toMatchObject({
      id: 'sess-1',
      kind: 'import',
      variants: ['take-one-20260930-141502-1.wav', 'b-20260930-141502-2.mp3'],
      prompt: { style: ['lofi'], instrumental: true },
    });
    expect(events).toEqual(['running:0/2', 'running:1/2', 'running:2/2', 'succeeded:2/2']);
  });

  it('appends to an existing history rather than replacing it', async () => {
    const prior = {
      version: 1,
      sessions: [
        { id: 'old', kind: 'import', provider: 'import', prompt: req.prompt, variants: ['x.mp3'], createdAt: 'then' },
      ],
    };
    const { service, written } = harness({ 'project.json': JSON.stringify(prior) });
    await service.importFiles(req, ['/a/one.flac']);
    const history = parseAudioProjectFile(written.get('project.json')!.toString());
    expect(history.sessions.map((s) => s.id)).toEqual(['old', 'sess-1']);
    expect(history.sessions[1]!.variants).toEqual(['one-20260930-141502.flac']);
  });

  it('refuses a non-audio pick without writing a session', async () => {
    const { service, written, events } = harness();
    const result = await service.importFiles(req, ['/a/notes.txt']);
    expect(result).toMatchObject({ ok: false, message: 'notes.txt is not an audio file.' });
    expect(written.has('project.json')).toBe(false);
    expect(events.at(-1)).toBe('failed:0/1');
  });

  it('reports Import as available but not generating', () => {
    expect(harness().service.providerStatuses()).toEqual([{ id: 'import', available: true, generates: false }]);
  });
});

describe('audioSlug', () => {
  it('drops the extension and punctuation', () => {
    expect(audioSlug('My Song (demo).wav')).toBe('my-song-demo');
    expect(audioSlug('!!!')).toBe('audio');
  });
});
