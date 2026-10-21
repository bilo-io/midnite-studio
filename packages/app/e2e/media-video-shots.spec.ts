import { expect, test } from '@playwright/test';

import {
  clickRailLink,
  fixtures,
  installMockBridge,
  type MockFixtures,
  settle,
  SHOT_VIEWPORTS,
  shotPath,
} from './shots-helper';

/**
 * Phase 99 Theme D — Media ▸ Video screenshots for the PR. Not assertions
 * (`video-tab.bridge.test.tsx` owns those). Run with `MSTUDIO_SHOTS=1`.
 */
const OUT = '../../docs/screenshots/p99-d';
const SETTLE_MS = 300;

const PROJECTS = [
  { id: 'acme/marketing/001-launch', title: 'Launch film', valid: true, composition: 'AcmeLaunch' },
  { id: 'acme/marketing/002-teaser', title: 'Teaser', valid: true, composition: 'AcmeTeaser' },
];

const DATA: MockFixtures = {
  ...fixtures,
  video: {
    projects: PROJECTS,
    resolution: { root: '/work/acme-videos', source: 'repo', setupTarget: '/work/acme-videos/.midnite/media/video' },
    files: {
      'acme/marketing/001-launch:output': [
        { name: 'v1-rough.mp4', isDir: false, size: 4_200_000, mtimeMs: 1 },
        { name: 'v2-scored.mp4', isDir: false, size: 5_100_000, mtimeMs: 2 },
        { name: 'v3-high.mp4', isDir: false, size: 6_000_000, mtimeMs: 3 },
        { name: 'v3-low.mp4', isDir: false, size: 2_000_000, mtimeMs: 3 },
        { name: 'CHANGELOG.md', isDir: false, size: 300, mtimeMs: 3 },
      ],
      'acme/marketing/001-launch:input': [{ name: 'BRIEF.md', isDir: false, size: 900, mtimeMs: 1 }],
      '-:assets': [
        { name: 'audio', isDir: true, size: 0, mtimeMs: 1 },
        { name: 'logos', isDir: true, size: 0, mtimeMs: 1 },
        { name: 'logos/acme-mark.svg', isDir: false, size: 2048, mtimeMs: 1 },
      ],
    },
    fileContent: {
      'acme/marketing/001-launch:output/CHANGELOG.md':
        '# Launch film — render history\n\n## v3-high — 2026-09-29\n\n- high-energy variant of the cut\n\n## v2-scored — 2026-09-28\n\n- scored to the soundtrack; tightened the intro\n',
    },
  },
};

async function openVideo(page: import('@playwright/test').Page, data: MockFixtures): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 90_000 });
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await page.getByRole('tab', { name: 'Video' }).click();
    await expect(page.getByRole('tab', { name: 'Video', selected: true })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 5000 });
}

test.describe('media video screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: SHOT_VIEWPORTS.board });

  test('iteration selected', async ({ page }) => {
    await openVideo(page, DATA);
    await page.getByRole('button', { name: /Launch film/ }).click();
    await page.getByRole('button', { name: 'v2-scored.mp4', exact: true }).click();
    await page.getByText('tightened the intro').waitFor();
    await settle(page, SETTLE_MS);
    await page.screenshot({ path: shotPath(OUT, 'iteration-selected.png') });
  });

  test('render dialog', async ({ page }) => {
    await openVideo(page, DATA);
    await page.getByRole('button', { name: /Launch film/ }).click();
    await page.getByRole('button', { name: 'Render…' }).click();
    await page.getByTestId('video-render-dialog').waitFor();
    await page.getByLabel('Codec').selectOption('vp9');
    await settle(page, SETTLE_MS);
    await page.screenshot({ path: shotPath(OUT, 'render-dialog.png') });
  });

  test('setup video', async ({ page }) => {
    await openVideo(page, {
      ...fixtures,
      video: { resolution: { root: null, source: null, setupTarget: '/work/app/.midnite/media/video' } },
    });
    await page.getByRole('heading', { name: 'Set up Video' }).waitFor();
    await settle(page, SETTLE_MS);
    await page.screenshot({ path: shotPath(OUT, 'setup-video.png') });
  });
});
