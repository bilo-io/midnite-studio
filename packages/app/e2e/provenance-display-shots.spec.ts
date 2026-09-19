import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * Committed screenshots for the three agent-provenance display modes
 * (`Settings ▸ Graph ▸ Agent provenance`): the corner badge, the mark beside
 * the avatar, and the alternating node in each of its two halves — plus the
 * settings page that chooses between them.
 *
 * Gated behind `MSTUDIO_SHOTS` like every other shots suite: committed images,
 * not assertions a normal `app:e2e` run must keep passing.
 */

const OUT = '../../docs/screenshots/adhoc-provenance-display';

const CLAUDE = { name: 'Claude', email: 'noreply@anthropic.com' };
const HUMANS = [
  { name: 'Ada Lovelace', email: 'ada@example.com' },
  { name: 'Grace Hopper', email: 'grace@example.com' },
];

const sha = (i: number) => `${i}`.padStart(40, 'a');

/**
 * Three provenance kinds in one screen, in the order they are easiest to tell
 * apart: agent-authored, co-authored (`mixed`), then plain human.
 *
 * `classifyProvenance` derives all three from the commit alone, against the
 * roster's Claude signature — the fixture states no provenance directly, so
 * what is photographed is the real classification path.
 */
const COMMITS = [
  { author: CLAUDE, coAuthors: [], subject: 'feat(graph): lane layout runs in main' },
  {
    author: HUMANS[0]!,
    coAuthors: [`${CLAUDE.name} <${CLAUDE.email}>`],
    subject: 'fix(graph): NUL-delimited parsing everywhere',
  },
  { author: HUMANS[1]!, coAuthors: [], subject: 'chore(tasks): claim the next theme' },
  { author: CLAUDE, coAuthors: [], subject: 'refactor(stats): one traversal, many aggregates' },
  {
    author: HUMANS[0]!,
    coAuthors: [`${CLAUDE.name} <${CLAUDE.email}>`],
    subject: 'test(graph): the provenance mark, every mode',
  },
  { author: HUMANS[1]!, coAuthors: [], subject: 'docs(readme): the install one-liner' },
];

const GRAPH_ROWS = COMMITS.map((spec, i) => ({
  row: i,
  lane: 0,
  colorIdx: 0,
  laneCount: 1,
  edges: [
    { fromLane: 0, toLane: 0, type: i === 0 ? 'merge' : 'straight', colorIdx: 0 },
  ],
  commit: {
    sha: sha(i),
    parents: i === COMMITS.length - 1 ? [] : [sha(i + 1)],
    authorName: spec.author.name,
    authorEmail: spec.author.email,
    authorDate: 1_787_000_000 - i * 3600,
    committerDate: 1_787_000_000 - i * 3600,
    subject: spec.subject,
    refs: i === 0 ? ['refs/heads/main'] : [],
    coAuthors: spec.coAuthors,
    sessionTrailers: [],
  },
}));

/**
 * Claude's real signature, from `BUILTIN_AGENTS` in `shared/src/terminal.ts`.
 *
 * The mock roster ships without signatures on purpose — see `agentSignatures`
 * in `mock-bridge.ts` — so a spec that wants provenance to classify has to ask
 * for it, which is what this does.
 */
const CLAUDE_SIGNATURE = {
  agentId: 'claude',
  emails: [CLAUDE.email],
  names: ['Claude', 'Claude Code'],
};

const provenanceFixtures: MockFixtures = {
  ...fixtures,
  graphRows: GRAPH_ROWS,
  refs: [],
  agentSignatures: [CLAUDE_SIGNATURE],
};

/**
 * Gravatar answers 404, so every node shows its generated initials.
 *
 * Deliberate rather than incidental: a real Gravatar would make the shot
 * depend on the network and on whoever owns that email today, and the mark is
 * what these images are about — a fetched face would only compete with it.
 */
async function stubGravatar(page: Page): Promise<void> {
  await page.route('**gravatar.com/**', (route) => route.fulfill({ status: 404, body: '' }));
}

async function openGraph(page: Page, mode: string): Promise<void> {
  await stubGravatar(page);
  await page.addInitScript((seeded) => {
    window.localStorage.setItem(
      'midnite-studio.ui',
      JSON.stringify({
        state: { graphTheme: 'gitkraken', graphProvenanceMark: seeded },
        version: 18,
      }),
    );
  }, mode);
  await installMockBridge(page, provenanceFixtures);
  await page.goto('/graph');
  const repoButton = page
    .locator('aside[aria-label="Repositories"]')
    .getByRole('button', { name: 'midnite-studio', exact: true });
  if (await repoButton.isVisible()) await repoButton.click();
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  await page.waitForTimeout(400);
}

test.describe('agent provenance display modes', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const mode of ['badge', 'beside'] as const) {
    test(`graph — ${mode}`, async ({ page }) => {
      await openGraph(page, mode);
      await page.locator('[role="grid"]').screenshot({ path: `${OUT}/graph-${mode}.png` });
    });
  }

  test('graph — swap, both halves of the turn', async ({ page }) => {
    await openGraph(page, 'swap');
    const grid = page.locator('[role="grid"]');
    await grid.screenshot({ path: `${OUT}/graph-swap-human.png` });
    // One full interval plus the 500ms crossfade, so the agent face is settled
    // rather than caught mid-fade.
    await page.waitForTimeout(5_600);
    await grid.screenshot({ path: `${OUT}/graph-swap-agent.png` });
  });

  test('the settings picker', async ({ page }) => {
    await openGraph(page, 'badge');
    await page.getByRole('button', { name: 'Settings' }).click();
    await page
      .getByRole('navigation', { name: 'Settings pages' })
      .getByRole('button', { name: 'Graph' })
      .click();
    const region = page.getByRole('region', { name: 'Agent provenance' });
    await expect(region).toBeVisible();
    // The settings pages fade in; shoot the settled frame, not the fade.
    await page.waitForTimeout(600);
    await region.screenshot({ path: `${OUT}/settings-agent-provenance.png` });
  });
});
