import { describe, expect, it } from 'vitest';

import { createMusicBroker, musicWorkerScriptPath, type MusicWorkerHandle } from './music-broker';
import type { MusicWorkerIn, MusicWorkerOut } from './worker-protocol';

/** A fake utility process: records what main posts and lets the test play the worker's replies. */
function fakeWorker() {
  const posted: MusicWorkerIn[] = [];
  let onMessage: (m: unknown) => void = () => undefined;
  let onExit: (code: number) => void = () => undefined;
  let killed = false;
  const handle: MusicWorkerHandle = {
    postMessage: (m) => posted.push(m as MusicWorkerIn),
    on: ((event: string, listener: never) => {
      if (event === 'message') onMessage = listener;
      else onExit = listener;
    }) as MusicWorkerHandle['on'],
    kill: () => {
      killed = true;
    },
  };
  return { handle, posted, reply: (m: MusicWorkerOut) => onMessage(m), exit: () => onExit(1), killed: () => killed };
}

const nextTick = () => new Promise((r) => setTimeout(r, 0));

describe('music broker', () => {
  it('forks lazily, configures the worker first, and resolves status by id', async () => {
    const w = fakeWorker();
    let spawned = 0;
    const broker = createMusicBroker({ spawn: () => (spawned++, w.handle) });
    broker.configure('/userData');
    expect(spawned).toBe(0);

    const status = broker.status();
    expect(w.posted[0]).toEqual({ type: 'configure', directory: '/userData' });
    const req = w.posted[1] as { id: string };
    w.reply({ type: 'status-reply', id: req.id, value: { state: 'ready' } });
    expect(await status).toEqual({ state: 'ready' });
    expect(spawned).toBe(1);
  });

  it('renders one at a time, forwards progress, and cancels via the abort signal', async () => {
    const w = fakeWorker();
    const broker = createMusicBroker({ spawn: () => w.handle });
    const controller = new AbortController();
    const progress: number[] = [];
    const first = broker.engine.render({ prompt: 'a', seconds: 5 }, { signal: controller.signal, onProgress: (f) => progress.push(f) });
    const second = broker.engine.render({ prompt: 'b', seconds: 5 }, { signal: new AbortController().signal, onProgress: () => undefined });
    await nextTick();

    const renders = () => w.posted.filter((m) => m.type === 'render') as Extract<MusicWorkerIn, { type: 'render' }>[];
    expect(renders()).toHaveLength(1); // the second waits its turn
    w.reply({ type: 'render-progress', id: renders()[0]!.id, fraction: 0.4 });
    expect(progress).toEqual([0.4]);

    controller.abort();
    expect(w.posted.at(-1)).toEqual({ type: 'cancel', id: renders()[0]!.id });
    w.reply({ type: 'render-reply', id: renders()[0]!.id, ok: false, message: 'cancelled' });
    await expect(first).rejects.toThrow('cancelled');

    await nextTick();
    expect(renders()).toHaveLength(2);
    w.reply({ type: 'render-reply', id: renders()[1]!.id, ok: true, samples: new Float32Array(3), sampleRate: 32000 });
    await expect(second).resolves.toMatchObject({ sampleRate: 32000 });
  });

  it('streams install progress to the caller and maps the reply to a GitOpResult', async () => {
    const w = fakeWorker();
    const broker = createMusicBroker({ spawn: () => w.handle });
    const seen: string[] = [];
    const done = broker.install((p) => seen.push(`${p.phase}:${p.fraction}`));
    const id = (w.posted.find((m) => m.type === 'install') as { id: string }).id;
    w.reply({ type: 'install-progress', progress: { phase: 'download', fraction: 0.5 } });
    w.reply({ type: 'install-reply', id, ok: false, message: 'offline' });
    expect(await done).toMatchObject({ ok: false, message: 'offline' });
    expect(seen).toEqual(['download:0.5']);
  });

  it('settles everything outstanding when the worker crashes, then respawns on next use', async () => {
    const workers = [fakeWorker(), fakeWorker()];
    const broker = createMusicBroker({ spawn: () => workers.shift()!.handle });
    const first = workers[0]!;
    const render = broker.engine.render({ prompt: 'a', seconds: 5 }, { signal: new AbortController().signal, onProgress: () => undefined });
    const status = broker.status();
    await nextTick();
    first.exit();
    await expect(render).rejects.toThrow('crashed');
    expect(await status).toMatchObject({ state: 'unavailable' });

    const again = broker.status();
    expect(workers).toHaveLength(0); // a second worker was forked
    void again;
  });

  it('kills the worker on dispose and rejects in-flight renders', async () => {
    const w = fakeWorker();
    const broker = createMusicBroker({ spawn: () => w.handle });
    const render = broker.engine.render({ prompt: 'a', seconds: 5 }, { signal: new AbortController().signal, onProgress: () => undefined });
    await nextTick();
    broker.dispose();
    await expect(render).rejects.toThrow('crashed');
    expect(w.killed()).toBe(true);
  });

  it('keeps the worker script inside app.asar (no unpacked rewrite)', () => {
    expect(musicWorkerScriptPath('/Applications/X.app/Contents/Resources/app.asar/dist/bundle')).toBe(
      '/Applications/X.app/Contents/Resources/app.asar/dist/bundle/music-worker.js',
    );
  });
});
