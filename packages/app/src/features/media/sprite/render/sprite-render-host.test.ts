import type { SpriteRenderRequestEvent } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleRenderRequest } from './sprite-render-host';

const runRenderJob = vi.fn();
vi.mock('./render-job', () => ({ runRenderJob: (...args: unknown[]) => runRenderJob(...args) }));

const event: SpriteRenderRequestEvent = {
  jobId: 'job-1',
  repoId: 'repo-1',
  model: { project: 'characters', path: 'knight/knight.json' },
  frameSize: [64, 64],
  directions: ['e'],
  settings: { camera: 'side', elevationDeg: 0, azimuthDeg: 0, shading: 'lit', outline: false, supersample: 4 },
  clips: [{ name: 'walk', frames: 8, fps: 10, loop: 'loop' }],
};

function install() {
  const sprite = { renderReady: vi.fn(async () => ({ ok: true })), renderFrames: vi.fn(async () => ({ ok: true })) };
  const file = { read: vi.fn(async () => ({ ok: true, value: '{"spec":{}}' })) };
  (window as unknown as { midniteStudio: unknown }).midniteStudio = { media: { sprite, file } };
  return { sprite, file };
}

afterEach(() => {
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  runRenderJob.mockReset();
});

describe('SpriteRenderHost', () => {
  it('acknowledges at once, then hands the job to the lazily loaded renderer with the bridge wired in', async () => {
    const { sprite, file } = install();
    runRenderJob.mockImplementation(async (_e, api) => {
      expect(sprite.renderReady).toHaveBeenCalledWith({ jobId: 'job-1' });
      expect(await api.readText({ repoId: 'repo-1', project: 'characters', path: 'knight/knight.json' })).toBe('{"spec":{}}');
      await api.post({ jobId: 'job-1', frames: [], done: true });
    });
    await handleRenderRequest(event);
    expect(file.read).toHaveBeenCalledWith({ repoId: 'repo-1', tab: 'model', project: 'characters', path: 'knight/knight.json' });
    expect(sprite.renderFrames).toHaveBeenCalledWith({ jobId: 'job-1', frames: [], done: true });
  });

  it('a renderer that throws ends the job with its message', async () => {
    const { sprite } = install();
    runRenderJob.mockRejectedValue(new Error('WebGL is unavailable.'));
    await handleRenderRequest(event);
    expect(sprite.renderFrames).toHaveBeenCalledWith({ jobId: 'job-1', frames: [], done: true, error: 'WebGL is unavailable.' });
  });
});
