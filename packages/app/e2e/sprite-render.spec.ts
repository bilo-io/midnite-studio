import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge } from '../test-support/mock-bridge';

/**
 * Phase 106 Theme E render smoke. **Needs real WebGL + OffscreenCanvas** — the three.js renderer the
 * `SpriteRenderHost` loads cannot run in jsdom, which is why this one check is an e2e rather than a
 * vitest (the camera maths, clip sampling and the main-side relay are all vitest). It renders one
 * clip of an auto-rigged biped from 4 directions and asserts each direction's frames are the frame
 * size, not empty, and transparent in the corners.
 */
test('renders 1 clip × 4 directions of a rigged model into non-empty frames with transparent corners', async ({ page }) => {
  test.setTimeout(120_000);
  await installMockBridge(page, fixtures);
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const mod = (await import(/* @vite-ignore */ '/e2e/sprite-render-fixture.ts')) as typeof import('./sprite-render-fixture');
    const rendered = await mod.renderFixture();
    const firsts = ['s', 'w', 'n', 'e'].map((dir) => rendered.frames.find((f) => f.dir === dir && f.index === 0));
    return {
      error: rendered.error,
      total: rendered.total,
      count: rendered.frames.length,
      inspected: await Promise.all(firsts.map((f) => (f ? mod.inspectPng(f.png) : null))),
    };
  });
  expect(result.error).toBeNull();
  expect(result.count).toBe(result.total);
  for (const frame of result.inspected) {
    expect(frame).not.toBeNull();
    expect(frame!.width).toBe(64);
    expect(frame!.height).toBe(64);
    expect(frame!.opaque).toBeGreaterThan(100);
    expect(frame!.corners).toEqual([0, 0, 0, 0]);
  }
});
