import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * One sync button, and what happens when the sync does not go cleanly.
 *
 * The unit tests already own the two decisions underneath — which steps a
 * branch state implies (`syncPlan`) and which repair a failure earns
 * (`syncResolution`). What only the assembled app can show is that the steps
 * actually run in that order, that a failed one stops the ones after it, and
 * that agreeing to the repair puts a real command in a real terminal.
 */
const base: MockFixtures = { ...fixtures, statusEntries: [] };

const open = async (page: Page, data: MockFixtures = base): Promise<void> => {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Graph' })).toBeVisible();
};

type OpCall = { op: string; args: unknown };
const ops = (page: Page) =>
  page.evaluate(() => (window as unknown as { __mgitOps: OpCall[] }).__mgitOps);

const ptyCreates = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __mgitPty: { creates: { agentId?: string; initialInput?: string }[] };
        }
      ).__mgitPty.creates,
  );

/** The title bar's cluster, which is where the button is at `md`. */
const syncButton = (page: Page) => page.getByRole('button', { name: /^Sync —/ }).first();

test.describe('the sync button', () => {
  test('replaces the pull and push arrows, and carries their counts', async ({ page }) => {
    await open(page, { ...base, branchStatus: { ahead: 2, behind: 3 } });

    // The two arrows are gone. Nothing in the app should offer a bare push
    // beside the counts any more — the ordering mistake they invited is the
    // reason the button exists.
    await expect(page.getByRole('button', { name: /^Push/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Pull/ })).toHaveCount(0);

    // The label is the whole plan, so the click is never a surprise.
    await expect(syncButton(page)).toHaveAccessibleName('Sync — Fetch, then pull 3 and push 2.');
    await expect(syncButton(page)).toContainText('↑2');
    await expect(syncButton(page)).toContainText('↓3');
  });

  test('fetches, then pulls, then pushes — in that order', async ({ page }) => {
    await open(page, { ...base, branchStatus: { ahead: 2, behind: 3 } });
    await syncButton(page).click();

    await expect
      .poll(async () => (await ops(page)).map((call) => call.op))
      .toEqual(['fetch', 'pull', 'push']);
  });

  test('publishes an unpublished branch rather than silently doing nothing', async ({ page }) => {
    await open(page, { ...base, branchStatus: { upstream: null, head: 'feature/x' } });

    const publish = page.getByRole('button', { name: /^Publish branch/ }).first();
    await expect(publish).toContainText('publish');
    await publish.click();

    // `-u`, because the branch has no upstream to push to yet.
    await expect.poll(async () => await ops(page)).toMatchObject([
      { op: 'fetch' },
      { op: 'push', args: { setUpstream: true } },
    ]);
  });

  test('stops at a conflicted pull and names the repair in the button', async ({ page }) => {
    await open(page, {
      ...base,
      branchStatus: { ahead: 2, behind: 3 },
      opResults: {
        pull: { ok: false, kind: 'conflict', op: 'merge', files: ['src/a.ts', 'src/b.ts'] },
      },
    });

    await syncButton(page).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'The pull left 2 files conflicted' })).toBeVisible();
    // The files are named. "Something conflicted" is not a state anyone can act on.
    await expect(page.getByRole('dialog')).toContainText('src/a.ts');

    // No push after a conflicted pull: it would push a half-merged tree.
    expect((await ops(page)).map((call) => call.op)).toEqual(['fetch', 'pull']);
  });

  test('hands the repair to Claude, in a terminal, without running it', async ({ page }) => {
    await open(page, {
      ...base,
      branchStatus: { ahead: 2, behind: 3 },
      opResults: {
        pull: { ok: false, kind: 'conflict', op: 'merge', files: ['src/a.ts'] },
      },
    });

    await syncButton(page).click();
    await page.getByRole('button', { name: 'Resolve the 1 merge conflict with Claude' }).click();

    await expect
      .poll(async () => (await ptyCreates(page)).at(-1))
      .toMatchObject({ agentId: 'claude' });

    // Exactly one, from a cold terminal. The store's restore used to REPLACE
    // the session list, which dropped this one while its pty kept running and
    // left the panel auto-opening a plain shell beside the orphan.
    const creates = await ptyCreates(page);
    expect(creates).toHaveLength(1);

    const typed = creates[0]?.initialInput ?? '';
    expect(typed).toContain('src/a.ts');
    expect(typed).toContain('Never force-push');
    // Single-quoted, so the backticked `git pull` in the prompt is text rather
    // than a command substitution the shell would run.
    expect(typed).toMatch(/^claude '/);
    // And NOT executed: the user's Return is the confirmation, the same posture
    // the Agent settings page takes with an uninstall command.
    expect(typed.endsWith('\r')).toBe(false);
  });

  test('offers a rebase when the push is rejected, not a force-push', async ({ page }) => {
    await open(page, {
      ...base,
      branchStatus: { ahead: 2, behind: 0 },
      opResults: {
        push: {
          ok: false,
          kind: 'error',
          message: 'The push was rejected.',
          stderr: 'hint: Updates were rejected because the remote contains work (non-fast-forward)',
        },
      },
    });

    await syncButton(page).click();

    await expect(
      page.getByRole('button', { name: 'Rebase onto origin/main and push, with Claude' }),
    ).toBeVisible();
    // Nowhere in the dialog is force offered, in any casing.
    await expect(page.getByRole('dialog')).not.toContainText(/force/i);
  });
});

test('the rail names the file browser Files, not Folder', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('link', { name: 'Files' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Folder' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Changes' })).toBeVisible();
});
