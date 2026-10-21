import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, settle, SHOT_VIEWPORTS } from './shots-helper';

/**
 * Phase 101 Theme E: real pointer input on the piano roll's canvas. Needs a real browser because
 * the note under the pointer is found by canvas geometry (`getBoundingClientRect` plus the view
 * transform) and drawn, moved and resized by pointer capture; the edit maths behind it
 * (`model/*.test.ts`) and the track controls (`editor-tab.test.tsx`) are vitest. The result is read
 * back through the bridge's `music.read`, since the canvas has no DOM to assert on.
 */
test.use({ viewport: SHOT_VIEWPORTS.wide });
test.describe.configure({ timeout: 90_000 });

const DATA: MockFixtures = {
  ...fixtures,
  media: {
    files: {
      'audio:album': {
        'Demo.mid': 'mid',
        'Demo.song.json': JSON.stringify({ name: 'Demo', tracks: [{ id: 'lead', name: 'Lead' }] }),
      },
    },
  },
};

type Note = { pitch: number; startTick: number; durationTicks: number };

async function openEditor(page: Page): Promise<void> {
  await page.route((u) => !/^(http:\/\/localhost|data:|blob:)/.test(u.href), (r) => r.abort());
  await installMockBridge(page, DATA);
  await page.goto('/');
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await page.getByRole('tab', { name: 'Audio' }).click();
    await page.getByRole('tab', { name: 'Editor' }).click({ timeout: 2500 });
    await expect(page.getByTestId('piano-roll-canvas')).toBeVisible({ timeout: 2500 });
  }).toPass({ timeout: 45_000 });
  await settle(page, 300);
}

const savedNotes = (page: Page): Promise<Note[]> =>
  page.evaluate(async () => {
    const res = await window.midniteStudio!.media.music.read({ repoId: 'repo-1', project: 'album', name: 'Demo' });
    return res.ok ? (res.value.tracks[0]?.notes ?? []) : [];
  });

/** The pointer position of the roll at (px right of the gutter, py down), in page coordinates. */
async function at(page: Page, px: number, py: number) {
  const box = (await page.getByTestId('piano-roll-canvas').boundingBox())!;
  return { x: box.x + 56 + px, y: box.y + py };
}

test('clicking draws a note, dragging it moves it, undo takes the move back', async ({ page }) => {
  await openEditor(page);
  const start = await at(page, 120, 70);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(async () => (await savedNotes(page)).length, { timeout: 5000 }).toBe(1);
  const [drawn] = await savedNotes(page);

  // Grab the note's body (one cell is 12px wide at the default zoom) and drag it right and up.
  const grab = await at(page, 124, 70);
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 48, grab.y - 14, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(async () => (await savedNotes(page))[0]?.startTick, { timeout: 5000 })
    .toBe(drawn!.startTick + 480);
  expect((await savedNotes(page))[0]!.pitch).toBe(drawn!.pitch + 1);

  await page.getByTestId('piano-roll').press('ControlOrMeta+z');
  await expect.poll(async () => (await savedNotes(page))[0]?.startTick, { timeout: 5000 }).toBe(drawn!.startTick);
});

test('dragging a note\'s right edge lengthens it and Delete removes it', async ({ page }) => {
  await openEditor(page);
  const start = await at(page, 120, 70);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(async () => (await savedNotes(page)).length, { timeout: 5000 }).toBe(1);
  const [drawn] = await savedNotes(page);

  const edge = await at(page, 120 + drawn!.durationTicks * 0.1 - 2, 70);
  await page.mouse.move(edge.x, edge.y);
  await page.mouse.down();
  await page.mouse.move(edge.x + 36, edge.y, { steps: 4 });
  await page.mouse.up();
  await expect
    .poll(async () => (await savedNotes(page))[0]?.durationTicks, { timeout: 5000 })
    .toBe(drawn!.durationTicks + 360);

  await page.getByTestId('piano-roll').press('Delete');
  await expect.poll(async () => (await savedNotes(page)).length, { timeout: 5000 }).toBe(0);
});
