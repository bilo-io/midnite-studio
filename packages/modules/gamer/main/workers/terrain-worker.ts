import { runTerrainBuild, type TerrainWorkerIn, type TerrainWorkerOut } from '@midnite/studio-feature-media-terrain/terrain-worker';

/**
 * `utilityProcess` entry point the Terrain feature's broker forks: decoding, resampling and writing a
 * 4097² heightfield are seconds of synchronous work, so they run here, in their own OS process, never on
 * main's event loop. A cancel (or quitting) kills this process; the next build forks a fresh one. The same
 * message loop as Studio's `terrain-worker/index.ts`.
 */
const post = (message: TerrainWorkerOut) => process.parentPort.postMessage(message);

process.parentPort.on('message', (event) => {
  const data = event.data as TerrainWorkerIn;
  if (data.type !== 'build') return;
  void (async () => {
    try {
      const stats = await runTerrainBuild({ dir: data.dir, outDir: data.outDir, spec: data.spec }, (stage, fraction) =>
        post({ type: 'progress', id: data.id, stage, fraction }),
      );
      post({ type: 'reply', id: data.id, ok: true, stats });
    } catch (error) {
      post({ type: 'reply', id: data.id, ok: false, message: error instanceof Error ? error.message : String(error) });
    }
  })();
});
