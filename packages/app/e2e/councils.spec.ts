import { expect, test } from '@playwright/test';

import { fixtures } from './fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Agent councils (Phase 34), assembled.
 *
 * The settle-barrier orchestration is main-only and already covered by
 * `desktop/src/main/council-runner.test.ts` — what only the assembled app can
 * show is that creating a council seeds its starter members, that editing a
 * member persists through `council.updateMembers`, and that running a
 * consultation renders member tabs and a synthesis. The mock's `run.start`
 * answers with an already-`completed` run rather than choreographing a fake
 * multi-process race — see its own comment in `mock-bridge.ts`.
 */

async function open(page: import('@playwright/test').Page, data: MockFixtures = fixtures): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  /*
    Pre-existing flakiness, not introduced by this phase: the very first nav
    click right after boot can land during a nav-rail re-render (reproduces
    identically on the untouched "Workflows" link) and is silently dropped —
    no error, the view just never changes. A second click always lands
    cleanly once that re-render has settled, so retry rather than chase the
    race here.
  */
  await expect(async () => {
    await clickRailLink(page, 'Councils');
    await expect(page.getByRole('button', { name: 'New council' })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 5000 });
}

test('creating a council seeds it with starter members', async ({ page }) => {
  await open(page);

  await page.getByRole('button', { name: 'New council' }).click();
  await page.getByRole('dialog', { name: 'New council' }).getByLabel('Name', { exact: true }).fill('Architecture review');
  await page.getByRole('button', { name: 'Create' }).click();

  await expect(page.getByRole('heading', { name: 'Architecture review' })).toBeVisible();

  // Member names render as editable inputs, not plain text — read their
  // values rather than text content.
  const nameInputs = page.getByRole('textbox', { name: 'Member name' });
  await expect(nameInputs).toHaveCount(4);
  const names = await nameInputs.evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
  expect(names).toEqual(['Optimist', 'Skeptic', 'Pragmatist', 'Visionary']);
});

test('running a consultation renders member answers and a synthesis', async ({ page }) => {
  await open(page);

  await page.getByRole('button', { name: 'New council' }).click();
  await page.getByRole('dialog', { name: 'New council' }).getByLabel('Name', { exact: true }).fill('Ship it?');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: 'Ship it?' })).toBeVisible();

  await page.getByPlaceholder('What should the council answer?').fill('Should we ship the new onboarding flow?');
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  /*
    Starting a run navigates the centre pane's panel-stack (Phase 42 Theme D)
    from the council entry to the new run entry, and both panes stay mounted
    for the length of the slide — the outgoing one marked `aria-hidden` but
    still matched by a plain `getByText`. Scoped to the one pane that isn't
    `aria-hidden` so an assertion mid-transition cannot resolve to two
    elements; a `getByRole` query would exclude it already (roles respect the
    accessibility tree), but the text/button queries below do not.
  */
  const activePane = page.locator('.panel-stack-pane:not([aria-hidden])');

  await expect(activePane.getByRole('button', { name: /^Optimist/ })).toBeVisible();
  await activePane.getByRole('button', { name: 'Synthesis' }).click();
  await expect(activePane.getByText(/Synthesis of the panel's views on/)).toBeVisible();

  await activePane.getByRole('button', { name: /^Optimist/ }).click();
  await expect(activePane.getByText(/Optimist's answer to/)).toBeVisible();
});

test('the panel-stack navigates list → council → run, and back/forward retrace it (Theme D)', async ({ page }) => {
  await open(page);

  await page.getByRole('button', { name: 'New council' }).click();
  await page.getByRole('dialog', { name: 'New council' }).getByLabel('Name', { exact: true }).fill('Retro');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: 'Retro' })).toBeVisible();

  const activePane = page.locator('.panel-stack-pane:not([aria-hidden])');
  const nav = page.getByRole('navigation', { name: 'Breadcrumb' });

  // Creating a council landed on the council entry directly (list → council).
  await expect(nav.getByText('Retro', { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: 'Back', exact: true })).toBeEnabled();
  await expect(page.getByRole('main').getByRole('button', { name: 'Forward', exact: true })).toBeDisabled();

  await page.getByPlaceholder('What should the council answer?').fill('Ship it?');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(activePane.getByRole('button', { name: /^Optimist/ })).toBeVisible();
  // list → council → run: a third crumb, and the stack is now 3 deep.
  await expect(nav.getByText('Run', { exact: true })).toBeVisible();

  // Back once: run → council. Still a council selected (the config panel and
  // its member list stay put) — only the `list` entry shows the empty state.
  await page.getByRole('main').getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Member name' }).first()).toBeVisible();
  // The breadcrumb trail still shows "Run" here — it renders the whole
  // stack, forward tail included, so a still-navigable entry stays clickable
  // rather than disappearing the moment it is no longer current.
  await expect(nav.getByText('Retro', { exact: true })).toBeVisible();

  // Back again: council → list. The config panel disappears along with it —
  // there is no council to configure.
  await page.getByRole('main').getByRole('button', { name: 'Back', exact: true }).click();
  await expect(activePane.getByText('Select a council')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New council' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: 'Back', exact: true })).toBeDisabled();

  // Forward twice retraces exactly back to the run.
  await page.getByRole('main').getByRole('button', { name: 'Forward', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'Forward', exact: true }).click();
  await expect(activePane.getByRole('button', { name: /^Optimist/ })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: 'Forward', exact: true })).toBeDisabled();
});

test('a run picked from the left rail navigates the centre pane (Theme E)', async ({ page }) => {
  await open(page);

  await page.getByRole('button', { name: 'New council' }).click();
  await page.getByRole('dialog', { name: 'New council' }).getByLabel('Name', { exact: true }).fill('Roadmap');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: 'Roadmap' })).toBeVisible();

  const activePane = page.locator('.panel-stack-pane:not([aria-hidden])');

  // Starting a run auto-navigates the rail from the council list into this
  // council's run list — the same PanelStack, driven by the same push.
  await page.getByPlaceholder('What should the council answer?').fill('First question');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(activePane.getByRole('button', { name: /^Optimist/ })).toBeVisible();

  // "Back to councils" in the rail returns to the council picker without
  // touching the centre/config panes' own selection.
  await page.getByRole('button', { name: 'Back to councils' }).click();
  await expect(page.getByRole('button', { name: 'New council' })).toBeVisible();
  await expect(activePane.getByText('Select a council')).toBeVisible();

  // Picking the council again lands back on its run list in the rail, and
  // selecting the run from there (not the old centre tab strip, which no
  // longer exists) drives the centre pane the same way starting one did.
  // The council-list row's full name ("Roadmap 4 members") disambiguates it
  // from the breadcrumb's own "Roadmap" crumb, still on screen from before.
  await page.getByRole('button', { name: 'Roadmap 4 members' }).click();
  await page.getByRole('button', { name: /First question/ }).click();
  await expect(activePane.getByRole('button', { name: /^Optimist/ })).toBeVisible();
});

test('the navigation stack survives leaving Councils and coming back (Theme E)', async ({ page }) => {
  await open(page);

  await page.getByRole('button', { name: 'New council' }).click();
  await page.getByRole('dialog', { name: 'New council' }).getByLabel('Name', { exact: true }).fill('Survives');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: 'Survives' })).toBeVisible();

  // Councils is lazy and unmounts on view switch — the whole reason its
  // navigation stack lives in a module-level store rather than a local
  // `usePanelHistory` call.
  await clickRailLink(page, 'Graph');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();

  await clickRailLink(page, 'Councils');
  await expect(page.getByRole('heading', { name: 'Survives' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: 'Back', exact: true })).toBeEnabled();
});

/**
 * `panel-stack`'s slide, in the three configurations that matter (Phase 42
 * Theme F) — asserted through the real cascade rather than assumed. Phase 39
 * Theme G is the cautionary tale this batch was written against: a
 * reduced-motion rule that lost on specificity and shipped believing
 * otherwise. `.panel-stack-pane` carries a `transition`, not a `@keyframes`
 * animation (Theme A's own correction), so the assertion reads
 * `transitionDuration` rather than `animationName`.
 */
test.describe('panel-stack reduced motion — three configurations (Theme F)', () => {
  const paneTransitionDuration = (page: import('@playwright/test').Page) =>
    page
      .locator('.panel-stack-pane')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));

  test("data-motion='reduced' collapses the slide to an instant swap", async ({ page }) => {
    await open(page);
    await page.evaluate(() => document.documentElement.setAttribute('data-motion', 'reduced'));

    expect(await paneTransitionDuration(page)).toBeLessThan(0.01);
  });

  test("an explicit Motion: Full choice still animates with the OS's own reduce-motion on — the setting outranks the OS", async ({
    page,
  }) => {
    // Seeded before boot, not poked after `open()`: `motionMs()`
    // (`use-reveal.ts`) is read once per render, and nothing re-renders
    // `PanelStack` on a later DOM mutation alone — a raw post-boot
    // `setAttribute` call here would only prove the OTHER guards' pure-CSS
    // mechanism, not this component's. The persisted setting is what a real
    // explicit choice actually is: already on disk before the app's next
    // launch, present from the very first render — Phase 46 Theme E's fix
    // resolves `'system'` from the OS query, but never touches an explicit
    // `'full'`/`'reduced'` value, which is exactly what this configuration
    // now exercises end to end.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'midnite.settings',
        JSON.stringify({ state: { motion: 'full' }, version: 1 }),
      );
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);

    expect(await paneTransitionDuration(page)).toBeGreaterThan(0.1);
  });

  test("the default 'system' setting resolves against the OS's reduce-motion before it ever reaches data-motion", async ({
    page,
  }) => {
    // Phase 46 Theme E's fix, proven directly: before it, `useMotionPreference`
    // resolved the OS query to 'reduced'/'full' first, but `useAppearanceSync`
    // ran after it and overwrote the attribute with the literal *persisted*
    // setting — 'system' by default, never having been resolved — so
    // `data-motion` read literally 'system' here, matching no
    // `[data-motion='reduced']` guard regardless of what the OS asked for
    // (only the `@media` form's own independent OS check ever caught it).
    // Fixed at the source: both writers now resolve `'system'` via
    // `resolveSystemMotion()` before it reaches the DOM, so the attribute
    // itself now reads the resolved value.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);

    expect(
      await page.evaluate(() => document.documentElement.getAttribute('data-motion')),
    ).toBe('reduced');
    expect(await paneTransitionDuration(page)).toBeLessThan(0.01);
  });
});
