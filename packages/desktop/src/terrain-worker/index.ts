import { runTerrainBuild } from '../main/media/terrain/build-pipeline';
import type { TerrainWorkerIn, TerrainWorkerOut } from '../main/media/terrain/worker-protocol';

/**
 * `utilityProcess` entry point `terrain-broker.ts` forks (Phase 105 Theme B): decoding, resampling and
 * writing a 4097² heightfield are seconds of synchronous work, so they run here, in their own OS
 * process, never on main's event loop. The worker reads `inputs/*.png` and writes `build.tmp-<id>/`
 * itself; main swaps that over `build/` on success. A cancel kills this process (the loops cannot be
 * interrupted from inside) and the next build forks a fresh one.
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
