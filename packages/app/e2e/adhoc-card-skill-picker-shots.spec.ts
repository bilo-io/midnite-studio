import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import {
  clickRailLink,
  fixtures,
  installMockBridge,
  type MockFixtures,
  REPRODUCIBLE_REMOTE,
  setReducedMotion,
  setTheme,
  shotPath,
} from './shots-helper';

/**
 * PR-body screenshots for the Projects card skill picker — the combobox open
 * on the repo's own midnite skills, and with free text typed — in light and
 * dark. Screenshots only (a `-shots.spec.ts`, uncounted by the e2e budget);
 * the behaviour is carried by `card-skill-picker.test.tsx` and friends.
 *
 * The suggestions are this repo's REAL `.claude/skills/*` frontmatter, read
 * at run time, so the frame shows exactly what the IPC channel would answer.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise.
 */
const OUT = '../../docs/screenshots/adhoc-card-skill-picker';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.setTimeout(120_000);

function repoSkills(): NonNullable<MockFixtures['repoSkills']> {
  // Playwright runs from `packages/app`, the same cwd `OUT` is relative to.
  const root = join(process.cwd(), '../../.claude/skills');
  return readdirSync(root).flatMap((dir) => {
    try {
      const text = readFileSync(join(root, dir, 'SKILL.md'), 'utf8');
      const front = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '';
      const field = (key: string) =>
        (new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(front)?.[1] ?? '').replace(/^"(.*)"$/, '$1');
      return [{ name: field('name') || dir, description: field('description'), source: '.claude' as const }];
    } catch {
      return [];
    }
  });
}

const BOARD = {
  id: 'PVT_1',
  number: 7,
  title: 'Roadmap',
  url: 'https://github.com/orgs/bilo-io/projects/7',
  closed: false,
};

const STATUS_FIELD = {
  id: 'FIELD_status',
  name: 'Status',
  dataType: 'single_select' as const,
  options: [{ id: 'OPT_todo', name: 'Todo', color: 'GRAY' }],
};

const ITEM = {
  id: 'PVTI_1',
  content: {
    type: 'issue' as const,
    id: 'I_1',
    number: 604,
    title: 'Fix the skill picker in the Projects side panel',
    url: 'https://github.com/bilo-io/midnite-studio/issues/604',
    state: 'OPEN' as const,
    assignees: [],
    body: '',
    labels: [],
    dependencies: { blockedBy: [], parent: null, subIssues: [], blockedByTruncated: false, subIssuesTruncated: false },
  },
  fieldValues: {
    FIELD_status: { fieldId: 'FIELD_status', dataType: 'single_select' as const, optionId: 'OPT_todo', name: 'Todo' },
  },
};

const base: MockFixtures = {
  ...fixtures,
  remotes: [REPRODUCIBLE_REMOTE],
  refs: [],
  statusEntries: [],
  statusByWorktree: { '/tmp/midnite-studio': [] },
  forge: { cli: { reason: 'ready' } },
  forgeProject: {
    projects: [BOARD],
    fields: { [BOARD.id]: [STATUS_FIELD] },
    items: { [BOARD.id]: [ITEM] },
  },
  repoSkills: repoSkills(),
};

async function openPicker(page: Page, mode: 'light' | 'dark') {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installMockBridge(page, base);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 30_000 });
  if (mode === 'dark') await setTheme(page, 'dark');
  await setReducedMotion(page);
  await clickRailLink(page, 'Tasks');
  await page.getByRole('combobox', { name: 'Task source' }).selectOption(BOARD.id);
  await page.getByTestId('projects-view-mode-slot').getByRole('button', { name: 'Board view' }).click();
  await page.getByText(ITEM.content.title).first().click();
  const detail = page.getByTestId('card-detail').last();
  await expect(detail).toBeVisible();
  return { detail, picker: detail.getByRole('combobox', { name: 'Skill' }) };
}

async function shoot(page: Page, name: string): Promise<void> {
  const detail = page.getByTestId('card-detail').last();
  const box = (await detail.boundingBox())!;
  await page.waitForTimeout(300);
  await page.screenshot({
    path: shotPath(OUT, name),
    clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 620) },
  });
}

for (const mode of ['light', 'dark'] as const) {
  test(`picker open on the repo's midnite skills (${mode})`, async ({ page }) => {
    const { picker } = await openPicker(page, mode);
    await expect(picker).toHaveValue('/midnite-create-adhoc');
    await picker.click();
    await expect(page.getByRole('listbox', { name: 'Skill suggestions' })).toBeVisible();
    await shoot(page, `open-${mode}`);
  });

  test(`picker with free text typed (${mode})`, async ({ page }) => {
    const { picker } = await openPicker(page, mode);
    await picker.fill('/midnite-create 98 D');
    await expect(page.getByRole('listbox', { name: 'Skill suggestions' })).toBeVisible();
    await shoot(page, `free-text-${mode}`);
  });
}
