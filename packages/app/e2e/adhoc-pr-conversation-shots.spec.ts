import { expect, test } from '@playwright/test';

import { CONVERSATION_FORGE } from '../test-support/conversation-fixtures';
import {
  clickRailLink,
  fixtures,
  installMockBridge,
  type MockFixtures,
  REPRODUCIBLE_REMOTE,
  shotPath,
  SHOT_VIEWPORTS,
} from './shots-helper';

/** Conversation tab against the realistic mock fixture. Gated like every shots suite. */
const OUT = '../../docs/screenshots/adhoc-pr-conversation';

test.use({ viewport: SHOT_VIEWPORTS.ultraWide });
test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');

test('conversation tab', async ({ page }) => {
  const data: MockFixtures = {
    ...fixtures,
    remotes: [REPRODUCIBLE_REMOTE],
    statusEntries: [],
    statusByWorktree: { '/tmp/midnite-studio': [] },
    forge: CONVERSATION_FORGE,
  };
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await page.getByRole('link', { name: 'Reviews' }).hover();
  await page.waitForTimeout(800);
  await clickRailLink(page, 'Reviews');
  await page
    .getByTestId('reviews-groups')
    .getByRole('button', { name: 'All Pull Requests', exact: true })
    .click();
  await expect(page.getByRole('region', { name: 'Pull request #77' })).toBeVisible();
  await page.getByRole('tab', { name: 'Conversation' }).click();
  await expect(page.getByTestId('conversation-thread').first()).toBeVisible();
  await page.mouse.move(1200, 950);
  await page.waitForTimeout(900);
  await page.screenshot({ path: shotPath(OUT, 'conversation.png') });
});
