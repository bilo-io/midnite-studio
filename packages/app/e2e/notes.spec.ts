import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge } from './mock-bridge';

/**
 * Notes (Phase 58 Themes A–D) end to end, and the two contracts the phase
 * doc calls out as easy to get quietly wrong: the handoff types at the
 * prompt and never sends it, and a note survives longer than its repository
 * staying open — the opposite of the store this feature copies its shape
 * from having ever done that on purpose (`dashboard-store.ts`).
 */

async function open(page: Page): Promise<void> {
  await installMockBridge(page, fixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
}

/**
 * Keyboard rather than a click on the FAB: the browser pane (full layout)
 * overlays the whole content row, including the FAB button, and a keydown
 * listener does not care what pointer-events a CSS overlay claims. This is
 * also literally the "Meta+L then N" path `quick-access-menu.spec.ts` covers
 * for its own entry points.
 */
async function openNotes(page: Page): Promise<void> {
  await page.keyboard.press('Meta+l');
  await page.keyboard.press('n');
  await expect(notesModal(page)).toBeVisible();
}

const notesModal = (page: Page) => page.getByTestId('notes-modal');
const composer = (page: Page) => page.getByTestId('notes-composer');
const noteBody = (page: Page) => page.getByTestId('note-body');

const ptyInputs = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __mstudioPty: { creates: { sessionId: string; initialInput?: string }[] };
        }
      ).__mstudioPty.creates.map((create) => create.initialInput),
  );

test.beforeEach(async ({ page }) => {
  // A clean notes store per test — it persists to localStorage, and a
  // leftover note from a previous test would make "exactly one note" flaky.
  //
  // Once per context, not once per load: `addInitScript` runs again on
  // `page.reload()` (`browser-pane.spec.ts` hit the same trap first), and
  // wiping the store there would erase the very note a reload spec is about
  // to assert on. `sessionStorage` is the flag because it survives a reload
  // and dies with the (per-test) context.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('mstudio-e2e-notes-cleared')) return;
    sessionStorage.setItem('mstudio-e2e-notes-cleared', '1');
    localStorage.removeItem('midnite-studio.notes');
  });
});

test.describe('the full note lifecycle', () => {
  test('create, edit in place, tick off, hide completed, delete', async ({ page }) => {
    await open(page);
    await openNotes(page);

    // Create.
    await composer(page).fill('the retry logic here is wrong, look at it later');
    await composer(page).press('Enter');
    await expect(noteBody(page)).toHaveText('the retry logic here is wrong, look at it later');
    await expect(composer(page)).toHaveValue('');

    // Edit in place: click swaps to a textarea, Enter commits.
    await noteBody(page).click();
    const editor = page.getByTestId('note-edit-input');
    await expect(editor).toBeVisible();
    await editor.fill('the retry logic — fixed the backoff, still wrong on timeout');
    await editor.press('Enter');
    await expect(noteBody(page)).toHaveText(
      'the retry logic — fixed the backoff, still wrong on timeout',
    );

    // Escape cancels the edit and does NOT close the modal (Phase 62 Theme C
    // rule: an input-scoped Escape stops propagation).
    await noteBody(page).click();
    await page.getByTestId('note-edit-input').fill('a draft I will not keep');
    await page.keyboard.press('Escape');
    await expect(notesModal(page)).toBeVisible();
    await expect(noteBody(page)).toHaveText(
      'the retry logic — fixed the backoff, still wrong on timeout',
    );

    // An emptied body cancels rather than deletes.
    await noteBody(page).click();
    await page.getByTestId('note-edit-input').fill('   ');
    await page.getByTestId('note-edit-input').press('Enter');
    await expect(noteBody(page)).toHaveText(
      'the retry logic — fixed the backoff, still wrong on timeout',
    );

    // Tick off, then hide completed.
    await page.getByRole('checkbox', { name: 'Mark note completed' }).check();
    await expect(noteBody(page)).toHaveClass(/line-through/);
    await page.getByTestId('toggle-hide-completed').click();
    await expect(noteBody(page)).toHaveCount(0);
    await page.getByTestId('toggle-hide-completed').click();
    await expect(noteBody(page)).toBeVisible();

    // Delete routes through the same confirm dialog every destructive action
    // in the app uses, rather than vanishing the note on click.
    await page.getByRole('button', { name: 'Delete note' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete note' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('Nothing captured yet')).toBeVisible();
  });

  test('hands off to a plan: types at the prompt, sends nothing, marks the note planned', async ({
    page,
  }) => {
    await open(page);
    await openNotes(page);

    await composer(page).fill('draft a plan for the settings redesign');
    await composer(page).press('Enter');

    await page.getByRole('button', { name: 'Draft plan' }).click();

    // The Notes modal gets out of the way of the terminal it just opened.
    await expect(notesModal(page)).toHaveCount(0);
    await expect(page.locator('[data-terminal-panel]')).toBeVisible();

    await expect.poll(() => ptyInputs(page)).toEqual([
      "claude '/midnite-brainstorm draft a plan for the settings redesign'",
    ]);
    const inputs = await ptyInputs(page);
    // `autoSend: false` end to end: no `\r` reached the pty. Pressing Return
    // is the human's confirmation, not the app's.
    expect(inputs[0]).not.toContain('\r');
    expect(inputs[0]).not.toContain('\n');

    // Not `openNotes`'s Meta+L: the handoff left focus inside the terminal it
    // just opened, and `fab.toggle` deliberately yields to a focused `.xterm`
    // (`TERMINAL_YIELD_COMMANDS`) — correctly, since `Meta+l` there means
    // "clear the shell" off macOS. The FAB button itself is unobstructed here
    // (no browser pane open in this spec), so a click reaches it instead.
    await page.getByRole('button', { name: 'Open quick access panel' }).click();
    await page.keyboard.press('n');
    await expect(notesModal(page)).toBeVisible();

    await expect(page.getByTestId('note-status-badge')).toHaveText('planned');
    // Neither body nor done was touched by the handoff.
    await expect(noteBody(page)).toHaveText('draft a plan for the settings redesign');
    await expect(page.getByRole('checkbox', { name: 'Mark note completed' })).not.toBeChecked();
  });

  test('hands off to an adhoc task the same way, through the other skill', async ({ page }) => {
    await open(page);
    await openNotes(page);

    await composer(page).fill('wire the missing icon on the empty state');
    await composer(page).press('Enter');

    await page.getByRole('button', { name: 'Adhoc task' }).click();
    await expect(page.locator('[data-terminal-panel]')).toBeVisible();

    await expect.poll(() => ptyInputs(page)).toEqual([
      "claude '/midnite-exec-adhoc wire the missing icon on the empty state'",
    ]);
  });
});

test.describe('the browser occluder contract', () => {
  async function openBrowser(page: Page): Promise<void> {
    await page.locator('[data-testid="browser-toggle"]').click();
    await expect(page.getByTestId('browser-launcher')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('browser-launcher')).toHaveCount(0);

    // A blank new-tab page is pure DOM, never a native `WebContentsView` —
    // `nativeVisible` in `browser-pane.tsx` requires `kind === 'page'`, so
    // there is nothing to occlude until a real page is navigated to.
    await page.getByRole('textbox', { name: 'Address' }).fill('example.com');
    await page.getByRole('textbox', { name: 'Address' }).press('Enter');
  }

  const visibleCalls = (page: Page) =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            __mstudioBrowserVisibleCalls: () => { tabId: string; visible: boolean }[];
          }
        ).__mstudioBrowserVisibleCalls(),
    );

  test('opening Notes hides the WebContentsView, closing it restores it', async ({ page }) => {
    await open(page);
    await openBrowser(page);

    // Sync fires once the pane is up with a real tab — wait for the first
    // `visible: true` rather than assuming it already landed.
    await expect.poll(async () => (await visibleCalls(page)).some((c) => c.visible)).toBe(true);

    await openNotes(page);
    await expect.poll(async () => (await visibleCalls(page)).at(-1)?.visible).toBe(false);

    await page.getByTestId('notes-modal').getByRole('button', { name: 'Close notes' }).click();
    await expect(notesModal(page)).toHaveCount(0);
    await expect.poll(async () => (await visibleCalls(page)).at(-1)?.visible).toBe(true);
  });
});

test.describe('per-repository scoping and persistence', () => {
  /**
   * `repos.list` in this harness always answers with exactly one repository
   * (`repo-1`) — there is no UI path in this mocked bridge to switch to a
   * second, live one. Seeding a note against a repo id the fixture never
   * serves is the honest proxy available here for "a repository not
   * currently in the workspace": it is exactly the shape a closed or
   * never-reopened repository's notes are in, and it is what the next two
   * specs are actually about — not a live repo switch.
   */
  async function seedTwoRepoNotes(page: Page): Promise<void> {
    await page.addInitScript(() => {
      const now = Date.now();
      const notes = {
        'note-a': {
          id: 'note-a',
          repoId: 'repo-1',
          body: 'a note against the open repository',
          status: 'captured',
          done: false,
          createdAt: now,
          updatedAt: now,
        },
        'note-b': {
          id: 'note-b',
          repoId: 'repo-2',
          body: 'a note against a repository not in this workspace',
          status: 'captured',
          done: false,
          createdAt: now,
          updatedAt: now,
        },
      };
      localStorage.setItem(
        'midnite-studio.notes',
        JSON.stringify({ state: { notes }, version: 1 }),
      );
    });
  }

  test('notes written against another repository are absent from the open one', async ({
    page,
  }) => {
    await seedTwoRepoNotes(page);
    await open(page);
    await openNotes(page);

    await expect(page.getByText('a note against the open repository')).toBeVisible();
    await expect(
      page.getByText('a note against a repository not in this workspace'),
    ).toHaveCount(0);
  });

  test('a reload preserves notes', async ({ page }) => {
    await open(page);
    await openNotes(page);
    await composer(page).fill('a thought worth keeping across a reload');
    await composer(page).press('Enter');
    await expect(noteBody(page)).toBeVisible();

    await page.reload();
    await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
    await openNotes(page);
    await expect(noteBody(page)).toHaveText('a thought worth keeping across a reload');
  });

  /**
   * Theme A's deliberate reversal, asserted explicitly: this is the
   * behaviour the phase doc names as most likely to be "fixed" back by a
   * later reader who assumes a closed repository's notes should be swept up
   * with it, the way `dashboard-store.ts` declined to for the same reason —
   * "re-adding one to find its data reset would make the persistence
   * pointless" applies with more force to a note than to a board layout.
   */
  test("closing a repository does not delete its notes — no automatic GC on load", async ({
    page,
  }) => {
    await seedTwoRepoNotes(page);
    await open(page);

    // `repo-2` is not in `repos.list()` at all on this load — the closest
    // this harness gets to "a repository the user no longer has open" — and
    // nothing here ever asks for a repo-2 note to render. The assertion is
    // that its record still exists afterwards, untouched.
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('midnite-studio.notes') ?? '{}'),
    );
    expect(Object.keys(stored.state.notes)).toEqual(
      expect.arrayContaining(['note-a', 'note-b']),
    );
    expect(stored.state.notes['note-b'].body).toBe(
      'a note against a repository not in this workspace',
    );
  });
});
