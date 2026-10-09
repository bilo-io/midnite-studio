import { describe, expect, it } from 'vitest';
import { failure, ok, type TerrainCluster } from '@midnite/studio-shared';
import type { VisionCall } from '../model/engines';
import { runVisionRelabel } from './vision-relabel';

describe('vision relabeling', () => {
  const dummyClusters: TerrainCluster[] = [
    { index: 0, count: 10, rgb: [100, 100, 100], lab: [50, 0, 0], initialClass: 'road' },
    { index: 1, count: 20, rgb: [200, 150, 100], lab: [60, 10, 20], initialClass: 'bare' },
  ];
  const dummyRgba = new Uint8Array(64 * 64 * 4).fill(128);

  it('a stub VisionCall returning bad JSON leaves the heuristic labels and adds the warning', async () => {
    const stubCall: VisionCall = async () => ok({ text: 'not valid json', model: 'mock-llava' });

    const result = await runVisionRelabel(stubCall, dummyRgba, 64, 64, dummyClusters);

    expect(result.relabelled.size).toBe(0);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain('Vision relabel skipped: invalid JSON');
  });

  it('a stub VisionCall failing returns empty relabel and warning', async () => {
    const stubCall: VisionCall = async () => failure('Model timed out');

    const result = await runVisionRelabel(stubCall, dummyRgba, 64, 64, dummyClusters);

    expect(result.relabelled.size).toBe(0);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain('Vision relabel skipped: Model timed out');
  });

  it('a stub VisionCall returning valid JSON successfully relabels clusters', async () => {
    const stubCall: VisionCall = async () =>
      ok({ text: JSON.stringify({ '0': 'building', '1': 'grass' }), model: 'mock-llava' });

    const result = await runVisionRelabel(stubCall, dummyRgba, 64, 64, dummyClusters);

    expect(result.warnings.length).toBe(0);
    expect(result.relabelled.get(0)).toBe('building');
    expect(result.relabelled.get(1)).toBe('grass');
  });
});
