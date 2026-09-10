import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * The companion panel (Phase 79 Themes C + H).
 *
 * Speech and audio are stubbed at the `window` level before the app's own
 * modules evaluate — `speechSynthesis` and `AudioContext` do not exist in
 * headless Chromium the way they do in Electron, and a spec that let the real
 * ones through would either hang on a voice list that never arrives or fail
 * with a constructor that is not there. Nothing in *this* slice speaks yet
 * (Theme F owns `speaker.ts`), so the stubs are here for the specs that will
 * inherit this file rather than for anything asserted below.
 *
 * **Themes D and E have since landed, and three assertions here moved because
 * of it.** This spec was written against `companion-ports.ts`'s no-op
 * defaults, so it asserted a panel that opens quiet: the header stuck at
 * "Ready" and the thread showing its empty state. With Theme D registered, the
 * panel greets on open — that is the feature — so those three now assert the
 * greeting instead of its absence. The rest of the file is unchanged: the
 * switch gates the panel, `C` opens it, the input bar posts a turn, the thread
 * renders it, and the state attribute the FAB choreography keys off is on the
 * elements it is supposed to be on.
 *
 * Phase 82 Theme C, wave 4: this file had grown to 20 tests since the wave
 * was scoped at ~11 — Phase 81 Theme C added 9 command-routing tests
 * ("direct"/"confirm"/"never") after that estimate. Those 9 are untouched:
 * they exercise the concierge's real command runtime end to end (a real
 * `terminal-toggle` status-bar button flipping, a real navigate to Graph, a
 * real detached-window focus — Electron-only, impossible in jsdom), which
 * `handoff.test.ts`'s "submitInput — Theme C, doing things there" describes
 * covers only at the pure-logic layer. Of the *original* 11, 9 moved to
 * `src/features/companion/companion-panel-workbench.bridge.test.tsx`. **2
 * stay**: "the docked panel sits between the view and the Loops panel" needs
 * `app.tsx`'s own resize-tween machinery (the frames the DOM-order assertion
 * reads), and "thread rows never overlap…" is real-layout geometry
 * (`getBoundingClientRect()` after a real resize) — both out of jsdom's
 * reach. The other 9 were already covered, more granularly, by
 * `companion-panel.test.tsx` (typing/Escape, both mic states, markdown
 * rendering, per-turn timestamps, the header's clear-confirm gate) mounting
 * `CompanionPanel` against synthetic `companion-ports.ts` fakes — porting
 * them again would have been the weaker stand-in the phase doc warns
 * against — except the greeting's *real* formatted-turn content (a real PR
 * link from the real digest), which the new bridge test ported forward
 * rather than dropped, and the Settings ▸ Companion "Speak replies aloud"
 * switch and the gating flow itself, both genuinely new coverage there.
 */

/** Enough of the Web Speech and WebAudio surfaces for the app to boot without them. */
async function stubSpeechAndAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const noop = () => {};
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        /*
          **Fires `end`, and it has to.** `speaker.ts` chains its chunks off
          `utterance.onend` and resolves the concierge's `await` from the last
          one, so a `speak` that merely does nothing leaves the flow awaiting a
          sentence that never finishes — the greeting posts its first line and
          the script stops there, for good.

          That is not hypothetical: it is exactly how this spec failed the
          moment the follow-up actually registered a speaker. Until then
          `setCompanionSpeaker` was uncalled, the flow ran against
          `silentSpeaker`, and a stub that swallowed utterances was never
          reached.
        */
        speak: (utterance: { onend?: (event: Event) => void } | undefined) => {
          setTimeout(() => utterance?.onend?.(new Event('end')), 0);
        },
        cancel: noop,
        pause: noop,
        resume: noop,
        getVoices: () => [],
        addEventListener: noop,
        removeEventListener: noop,
        speaking: false,
        pending: false,
        paused: false,
      },
    });
    // A constructor rather than an object: Theme G's audio does `new
    // AudioContext()`, and a stub that is not newable throws at the call site
    // rather than at the assertion.
    class StubAudioContext {
      state = 'suspended';
      currentTime = 0;
      destination = {};
      createGain() {
        return { gain: { value: 1, setValueAtTime: noop }, connect: noop, disconnect: noop };
      }
      createOscillator() {
        return { connect: noop, start: noop, stop: noop, frequency: { setValueAtTime: noop } };
      }
      resume() {
        return Promise.resolve();
      }
      suspend() {
        return Promise.resolve();
      }
      close() {
        return Promise.resolve();
      }
    }
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: StubAudioContext,
    });
  });
}

/**
 * Seed `companionEnabled` straight into the persisted store.
 *
 * The alternative is walking Settings ▸ Companion in every test, which the
 * first test below does exactly once — proving the switch is reachable and
 * that flipping it is what unlocks the leaf. Every other test starts from the
 * enabled state, because "enable it again" is not what those are about.
 */
async function seedCompanionEnabled(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      const stored = localStorage.getItem('midnite-studio.ui');
      const persisted = stored ? JSON.parse(stored) : { version: 14 };
      persisted.state = { ...persisted.state, companionEnabled: true };
      localStorage.setItem('midnite-studio.ui', JSON.stringify(persisted));
    } catch {
      /* Unparseable profile — the app discards it too. */
    }
  });
}

/**
 * Seed a transcript with one tall bullet-list turn followed by several short
 * one-line turns — the exact shape that exposed the virtualizer overlap bug:
 * a resize cleared the measured-size cache, and every short turn (whose own
 * box does not change size on rewrap) rendered at its old, now-wrong
 * `translateY` offset instead of the one after the tall turn.
 */
async function seedMixedHeightTranscript(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const now = Date.now();
    const turns = [
      {
        id: 'tall-0',
        role: 'companion',
        text:
          '**midnite-studio** — on `main`\n\n' +
          '- session A\n- session B\n- PR #1 landed\n- PR #2 landed\n' +
          '- a longer bullet describing what changed in enough detail that this bubble wraps to several lines',
        at: now - 1000 * 60 * 5,
        spoken: true,
      },
      { id: 'short-1', role: 'companion', text: 'What would you like to do?', at: now - 1000 * 60 * 4, spoken: true },
      { id: 'short-2', role: 'companion', text: 'Welcome back.', at: now - 1000 * 60 * 3, spoken: true },
      { id: 'short-3', role: 'companion', text: 'Back at it.', at: now - 1000 * 60 * 2, spoken: true },
      { id: 'short-4', role: 'companion', text: 'Where shall we start?', at: now - 1000 * 60 * 1, spoken: true },
    ];
    try {
      localStorage.setItem(
        'midnite-studio.companion',
        JSON.stringify({ state: { transcript: turns }, version: 1 }),
      );
    } catch {
      /* Unparseable profile — the app discards it too. */
    }
  });
}

async function open(page: Page): Promise<void> {
  await stubSpeechAndAudio(page);
  await installMockBridge(page, fixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
}

const panel = (page: Page) => page.getByTestId('companion-panel');

test('the docked panel sits between the view and the Loops panel', async ({ page }) => {
  await seedCompanionEnabled(page);
  await open(page);

  await page.keyboard.press('Meta+l');
  await page.keyboard.press('c');
  await expect(panel(page)).toBeVisible();

  await page.keyboard.press('Meta+l');
  await page.keyboard.press('l');
  await expect(page.getByRole('button', { name: 'Guard', exact: true })).toBeVisible();

  /*
    DOM order, not pixel order: `main · companion · loops` is what the phase
    specifies, and in a flex row the DOM is what decides it. `compareDocumentPosition`
    is the honest reading of "the companion comes first" — a left-of check on
    bounding boxes would pass just as well if both panels stacked.
  */
  const order = await page.evaluate(() => {
    const companion = document.querySelector('[data-companion-panel-frame]');
    const loops = document.querySelector('[data-fab-panel-frame]');
    if (!companion || !loops) return 'missing';
    return companion.compareDocumentPosition(loops) & Node.DOCUMENT_POSITION_FOLLOWING
      ? 'companion-first'
      : 'loops-first';
  });
  expect(order).toBe('companion-first');
});

/**
 * The overlap bug a user reported by screenshot: a tall bullet-list turn
 * followed by several short one-line turns, drawn on top of one another at
 * some panel widths.
 *
 * Root cause: `companion-thread.tsx` had its own `ResizeObserver` on the
 * scroll container calling `virtualizer.measure()` on every resize.
 * `@tanstack/react-virtual`'s `measure()` clears its *entire* measured-size
 * cache rather than forcing a fresh measurement — real remeasurement only
 * happens per item, via the library's own `ResizeObserver` on each rendered
 * row, and only when that row's own box actually changes size. A short turn
 * that wraps identically at both widths never fires that observer, so once
 * the cache was cleared it stayed positioned at the raw `estimateSize`
 * fallback (56px) instead of the offset after the tall turn above it —
 * which is exactly the pixel overlap in the report. The fix removes the
 * extra observer entirely: the virtualizer's built-in per-row `ResizeObserver`
 * (wired through `ref={virtualizer.measureElement}`) already re-measures a
 * row whenever a width change actually rewraps it, with no need for anything
 * at the container level.
 *
 * Asserted as real bounding boxes, not a snapshot, and at the narrow width
 * that reproduced it — a snapshot would not have caught this (the DOM and
 * classes are unchanged; only the computed `transform` offset is wrong).
 */
test('thread rows never overlap, including after a resize at a narrow width', async ({ page }) => {
  await seedCompanionEnabled(page);
  await seedMixedHeightTranscript(page);
  await open(page);
  await page.keyboard.press('Meta+l');
  await page.keyboard.press('c');
  await expect(page.getByTestId('companion-panel')).toBeVisible();

  // Wide first, so the resize below is a real width change and not the
  // panel's initial layout.
  await page.setViewportSize({ width: 1400, height: 900 });
  await expect(page.getByTestId('companion-thread')).toContainText('midnite-studio');

  // Narrow enough to rewrap the tall bullet-list turn — the width the user
  // hit the bug at.
  await page.setViewportSize({ width: 900, height: 900 });

  const thread = page.getByTestId('companion-thread');
  const rows = thread.locator('[data-turn-role]');
  await expect(rows.first()).toBeVisible();

  // The bounding box of every rendered row's *content*, in document order —
  // the virtualizer's own outer wrapper is legitimately `position: absolute`
  // by design (that is how any virtualized list places its rows), so the
  // honest assertion is that the boxes themselves never intersect, whatever
  // positions the virtualizer computed for them.
  const boxes = await rows.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    }),
  );
  expect(boxes.length).toBeGreaterThanOrEqual(5);

  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const overlaps = a.top < b.bottom - 1 && b.top < a.bottom - 1;
      expect(overlaps, `rows ${i} and ${j} overlap: ${JSON.stringify({ a, b })}`).toBe(false);
    }
  }
});

/**
 * Doing things there, by tier — Phase 81 Theme C.
 *
 * `app.lock` stands in for the confirm-tier flows here rather than
 * `sync.push`: it is `confirm`-tier too (Decision 5) but, unlike push/pull,
 * its `enabled` never depends on the fixture's branch/upstream state — so a
 * click on Run or an empty Return is provably real, not a mock guessing an
 * ahead-count right. `terminal.close`'s own "the command's own dialogs
 * survive" case needs a running foreground session to seed, which is left to
 * the phase doc's own packaged-Mac human pass alongside the push flow.
 */
test('direct: "toggle the terminal" opens it and says so', async ({ page }) => {
  await seedCompanionEnabled(page);
  await open(page);
  await page.keyboard.press('Meta+l');
  await page.keyboard.press('c');
  await expect(panel(page)).toBeVisible();
  await expect(page.getByTestId('companion-state-label')).toHaveText('Ready');

  await page.getByTestId('companion-input').fill('toggle the terminal');
  await page.getByTestId('companion-input').press('Enter');

  await expect(page.getByTestId('terminal-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('companion-thread')).toContainText('Toggle Terminal.');
});

/**
 * `vocabulary.commands` never carries a `never`-tier row at all (Theme A
 * drops them before building it), so there is no sentence the grammar itself
 * can turn into `{kind:'run', id:'browser.clearData'}` — the only real path
 * to the refusal is the headless router inventing one, which this patches
 * the mock's `companion.ask` to do, the same way the mic-disabled test above
 * patches `sttStatus`.
 */
test('never: the router inventing a never-tier id gets the palette refusal, not an action', async ({
  page,
}) => {
  await seedCompanionEnabled(page);
  await open(page);
  await page.evaluate(() => {
    const bridge = window.midniteStudio;
    if (bridge?.companion) {
      bridge.companion.ask = () =>
        Promise.resolve({
          ok: true,
          value: { say: 'Sure.', intent: { kind: 'run', id: 'browser.clearData' } },
        });
    }
  });
  await page.keyboard.press('Meta+l');
  await page.keyboard.press('c');
  await expect(panel(page)).toBeVisible();
  await expect(page.getByTestId('companion-state-label')).toHaveText('Ready');

  await page.getByTestId('companion-input').fill('could you tidy up the browser session');
  await page.getByTestId('companion-input').press('Enter');

  await expect(page.getByTestId('companion-thread')).toContainText(
    'That one needs the palette — Mod+K, then type it.',
  );
});

test('confirm: a pending action renders Run/Cancel chips, and Cancel changes nothing', async ({
  page,
}) => {
  await seedCompanionEnabled(page);
  await open(page);
  await page.keyboard.press('Meta+l');
  await page.keyboard.press('c');
  await expect(panel(page)).toBeVisible();
  await expect(page.getByTestId('companion-state-label')).toHaveText('Ready');

  await page.getByTestId('companion-input').fill('lock the screen');
  await page.getByTestId('companion-input').press('Enter');

  await expect(page.getByTestId('companion-thread')).toContainText(
    'Lock Screen? Say yes, press Return, or tap Run.',
  );
  const run = page.getByTestId('companion-pending-run');
  const cancel = page.getByTestId('companion-pending-cancel');
  await expect(run).toBeVisible();
  await expect(cancel).toBeVisible();

  await cancel.click();
  await expect(run).toHaveCount(0);
  await expect(page.getByTestId('companion-thread')).toContainText('Left it.');
  // Cancel really changed nothing — the lock screen never appeared.
  await expect(page.getByTestId('lock-screen-widgets')).toHaveCount(0);
});

test('confirm: the Run chip runs the pending action', async ({ page }) => {
  await seedCompanionEnabled(page);
  await open(page);
  await page.keyboard.press('Meta+l');
  await page.keyboard.press('c');
  await expect(panel(page)).toBeVisible();
  await expect(page.getByTestId('companion-state-label')).toHaveText('Ready');

  await page.getByTestId('companion-input').fill('lock the screen');
  await page.getByTestId('companion-input').press('Enter');
  await page.getByTestId('companion-pending-run').click();

  await expect(page.getByTestId('lock-screen-widgets')).toBeVisible();
  await expect(page.getByTestId('companion-pending-run')).toHaveCount(0);
});

test('confirm: an empty Return runs the identical pending action', async ({ page }) => {
  await seedCompanionEnabled(page);
  await open(page);
  await page.keyboard.press('Meta+l');
  await page.keyboard.press('c');
  await expect(panel(page)).toBeVisible();
  await expect(page.getByTestId('companion-state-label')).toHaveText('Ready');

  const input = page.getByTestId('companion-input');
  await input.fill('lock the screen');
  await input.press('Enter');
  await expect(page.getByTestId('companion-pending-run')).toBeVisible();

  // The textarea is already empty — Return confirms rather than sending a
  // blank message. Asserted on the thread rather than `lock-screen-widgets`:
  // the lock screen's own "any key dismisses it, no passcode configured"
  // behaviour reacts to this identical keystroke once it mounts, so the
  // widget is gone again by the time this resolves — the chip disappearing
  // and the success line are what prove the *companion* ran it once.
  await input.press('Enter');

  await expect(page.getByTestId('companion-pending-run')).toHaveCount(0);
  await expect(page.getByTestId('companion-thread')).toContainText('Lock Screen.');
});

// --- Phase 81 Theme B: "take me to the graph" ------------------------------

async function submit(page: Page, text: string): Promise<void> {
  const input = page.getByTestId('companion-input');
  await input.fill(text);
  await input.press('Enter');
}

test('"take me to the graph" navigates there and names it in the thread', async ({ page }) => {
  await seedCompanionEnabled(page);
  await open(page);
  await page.keyboard.press('Meta+l');
  await page.keyboard.press('c');
  await expect(panel(page)).toBeVisible();
  await expect(page.getByTestId('companion-thread')).toContainText('midnite-studio');

  // Off Graph first (the app's own default), so the assertion below proves a
  // real transition rather than "stayed where it already was".
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toHaveCount(0);

  await submit(page, 'take me to the graph');

  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  await expect(page.getByTestId('companion-thread')).toContainText('Commit Graph');
});

test('"open settings, the companion page" lands on the Companion settings page', async ({ page }) => {
  await seedCompanionEnabled(page);
  await open(page);
  await page.keyboard.press('Meta+l');
  await page.keyboard.press('c');
  await expect(panel(page)).toBeVisible();
  await expect(page.getByTestId('companion-thread')).toContainText('midnite-studio');

  await submit(page, 'open settings, the companion page');

  await expect(page.getByTestId('companion-enable')).toBeVisible();
  await expect(page.getByTestId('companion-thread')).toContainText('Settings');
});

test('a detached page is focused rather than reopened, and the docked view does not change', async ({
  page,
}) => {
  await seedCompanionEnabled(page);
  // `useWindowSync` reconciles `detachedPages` off `window.list()` — seeding
  // `openPopoutRoles` here is what makes the Graph page report as already
  // detached, the same fixture `detached-pages-shots.spec.ts` uses.
  await stubSpeechAndAudio(page);
  await installMockBridge(page, { ...fixtures, openPopoutRoles: ['graph'] } as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();

  await page.keyboard.press('Meta+l');
  await page.keyboard.press('c');
  await expect(panel(page)).toBeVisible();
  await expect(page.getByTestId('companion-thread')).toContainText('midnite-studio');

  await submit(page, 'show me the graph');

  await expect(page.getByTestId('companion-thread')).toContainText('own window');
  // Still docked and rendering — a focus, never a second copy.
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();

  const focusCalls = await page.evaluate(
    () => (window as unknown as { __mstudioFocusRoleCalls: Array<{ role: string }> }).__mstudioFocusRoleCalls,
  );
  expect(focusCalls).toEqual(expect.arrayContaining([{ role: 'graph' }]));
});

test('a navigate that would leave a dirty file defers to the unsaved-file guard, and touches nothing', async ({
  page,
}) => {
  await seedCompanionEnabled(page);
  await stubSpeechAndAudio(page);
  await installMockBridge(page, {
    ...fixtures,
    fsDirs: { 'repo:': [{ name: 'a.ts', kind: 'file', size: 20, isIgnored: false }] },
    fsFiles: {
      'repo:a.ts': { kind: 'text', content: 'const answer = 42;\n', size: 20, version: { mtimeMs: 1, size: 20 } },
    },
  } as MockFixtures);
  await page.goto('/');
  await clickRailLink(page, 'Explorer');
  await page.getByRole('treeitem', { name: /^a\.ts$/ }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.locator('.monaco-editor .view-lines').click();
  await page.keyboard.type('x');
  await expect(page.getByTitle('Unsaved changes')).toBeVisible();

  await page.keyboard.press('Meta+l');
  await page.keyboard.press('c');
  await expect(panel(page)).toBeVisible();
  await expect(page.getByTestId('companion-thread')).toContainText('midnite-studio');

  await submit(page, 'take me to the graph');

  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Save changes to "a.ts"?');
  await expect(page.getByTestId('companion-thread')).toContainText('unsaved file');
  // Still up after the turn posted — the companion touched nothing further.
  await expect(dialog).toBeVisible();
  await expect(page.getByTitle('Unsaved changes')).toBeVisible();
});
