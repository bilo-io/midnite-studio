import { ok, parseAudioProjectFile, parseAudioSidecar, type AudioImportRequest } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { audioSlug, createAudioService } from './audio-service';
import { importAudioProvider } from './import-adapter';
import { createMusicgenProvider } from './musicgen/provider';
import type { MusicEngine } from './musicgen/engine';

function harness(existing: Record<string, string> = {}, engine: MusicEngine = { render: async () => ({ samples: new Float32Array(32000), sampleRate: 32000 }) }) {
  const written = new Map<string, Buffer>(Object.entries(existing).map(([k, v]) => [k, Buffer.from(v)]));
  const events: string[] = [];
  const service = createAudioService({
    providers: { musicgen: createMusicgenProvider(engine), import: importAudioProvider },
    writeBytes: async ({ path, data }) => {
      written.set(path, data);
      return ok({ size: data.length, largeFile: false });
    },
    readText: async ({ path }) => {
      const data = written.get(path);
      return data ? ok(data.toString('utf8')) : { ok: false, kind: 'error', message: 'File not found.' };
    },
    readFile: async (abs) => Buffer.from(`bytes of ${abs}`),
    emit: (event) => events.push(`${event.status}:${event.completed}/${event.total}${event.stage ? `:${event.stage}` : ''}`),
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

  it('reports MusicGen as generating and Import as not', () => {
    expect(harness().service.providerStatuses()).toEqual([
      { id: 'musicgen', available: true, generates: true },
      { id: 'import', available: true, generates: false },
    ]);
  });
});

describe('audioSlug', () => {
  it('drops the extension and punctuation', () => {
    expect(audioSlug('My Song (demo).wav')).toBe('my-song-demo');
    expect(audioSlug('!!!')).toBe('audio');
  });
});

describe('audio service — generating provider', () => {
  const generateReq = { ...req, importId: 'gen-1', provider: 'musicgen' as const, prompt: { ...req.prompt, durationS: 10, count: 2 } };

  it('renders each variant, lands wav + sidecar, records a create session and streams stages', async () => {
    const { service, written, events } = harness();
    const result = await service.generate(generateReq);

    expect(result).toEqual({
      ok: true,
      value: { sessionId: 'sess-1', files: ['lofi-20260930-141502-1.wav', 'lofi-20260930-141502-2.wav'] },
    });
    expect(written.get('lofi-20260930-141502-1.wav')!.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(parseAudioSidecar(written.get('lofi-20260930-141502-1.json')!.toString())).toMatchObject({
      provider: 'musicgen',
      title: 'lofi',
    });
    const history = parseAudioProjectFile(written.get('project.json')!.toString());
    expect(history.sessions[0]).toMatchObject({ kind: 'create', provider: 'musicgen' });
    expect(events.some((e) => e.includes('Rendering variant 1/2'))).toBe(true);
    expect(events.at(-1)).toMatch(/^succeeded:2\/2/);
  });

  it('refuses a provider that only imports', async () => {
    const { service } = harness();
    const result = await service.generate({ ...generateReq, provider: 'import' });
    expect(result).toMatchObject({ ok: false, message: 'That provider does not generate audio.' });
  });

  it('keeps variants that landed when the run is cancelled mid-way, and reports cancelled', async () => {
    let calls = 0;
    let service!: ReturnType<typeof harness>['service'];
    const engine: MusicEngine = {
      render: async () => {
        calls += 1;
        if (calls === 2) service.cancel('gen-1');
        return { samples: new Float32Array(32000), sampleRate: 32000 };
      },
    };
    const h = harness({}, engine);
    service = h.service;
    const result = await service.generate(generateReq);

    expect(result).toMatchObject({ ok: false, message: 'cancelled' });
    expect(h.events.at(-1)).toMatch(/^cancelled:1\/2/);
    const history = parseAudioProjectFile(h.written.get('project.json')!.toString());
    expect(history.sessions[0]!.variants).toEqual(['lofi-20260930-141502-1.wav']);
  });

  it('reports an engine failure verbatim and writes no session when nothing landed', async () => {
    const h = harness({}, { render: async () => Promise.reject(new Error('model failed to load')) });
    const result = await h.service.generate(generateReq);
    expect(result).toMatchObject({ ok: false, message: 'model failed to load' });
    expect(h.written.has('project.json')).toBe(false);
    expect(h.events.at(-1)).toMatch(/^failed/);
  });
});
