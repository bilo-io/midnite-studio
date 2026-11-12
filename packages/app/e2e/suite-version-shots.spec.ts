import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { installSuiteBridge, SUITE_APP_URLS, VANGUARD_EMPTY_ANSWERS } from '../test-support/suite-bridge';

/**
 * PR-body screenshot only (Phase 131 Theme E; like every `-shots.spec.ts` it is not counted by the e2e budget):
 * Vanguard's rail version pill, open. Set `SHOTS_DIR` to where the PNG goes; it is not committed.
 */
const DIR = process.env.SHOTS_DIR;

test('suite app version drop-up', async ({ page }) => {
  test.skip(DIR === undefined, 'set SHOTS_DIR to take the shot');
  mkdirSync(DIR as string, { recursive: true });
  await installSuiteBridge(page, {
    answers: VANGUARD_EMPTY_ANSWERS,
    appVersion: '0.0.7',
    releaseNotes: {
      version: '0.0.7',
      error: null,
      notes: '### Added\n\n- Quarantine now keeps a restore point for every file it moves.\n\n### Fixed\n\n- A paused scan no longer resumes on wake.',
      sections: [
        { version: '0.0.7', date: '2026-11-20', body: '- Quarantine restore points.' },
        { version: '0.0.6', date: '2026-11-10', body: '- First release after the app split.' },
        { version: '0.0.5', date: '2026-11-01', body: '- Earlier work.' },
      ],
    },
  });
  await page.setViewportSize({ width: 1100, height: 720 });
  await page.goto(SUITE_APP_URLS.vanguard);
  const pill = page.getByTestId('suite-version-pill');
  await expect(pill).toBeVisible();
  await pill.click();
  await expect(page.getByTestId('earlier-releases')).toBeVisible();
  await page.screenshot({ path: `${DIR}/suite-version-dropup.png` });
});
