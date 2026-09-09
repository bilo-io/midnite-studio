import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge } from './mock-bridge';

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

const menu = (page: Page) => page.getByTestId('quick-access-menu');
const panel = (page: Page) => page.getByTestId('companion-panel');

test('companion disabled: the C leaf is disabled with its reason and the popover offers the enable row', async ({
  page,
}) => {
  await open(page);
  await page.keyboard.press('Meta+l');
  await expect(menu(page)).toBeVisible();

  await expect(menu(page).getByTestId('companion-strip')).toContainText(
    'Enable the companion in Settings',
  );
  const leaf = menu(page).getByTestId('quick-access-row-c');
  await expect(leaf).toHaveAttribute('aria-disabled', 'true');

  await page.keyboard.press('c');
  // The hint shows, the menu stays up, and no panel appears — a disabled row
  // is a no-op with an explanation, never a dead end that closes the menu.
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).getByText('Enable in Settings ▸ Companion')).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
});

test('Settings ▸ Companion enables it, and then C opens the panel', async ({ page }) => {
  await open(page);

  // The bottom-of-rail Settings entry is a plain button, not a router link.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'Companion', exact: true })
    .click();
  await page.getByTestId('companion-enable').check();
  await expect(page.getByTestId('companion-enable')).toBeChecked();

  await page.keyboard.press('Meta+l');
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).getByTestId('quick-access-row-c')).not.toHaveAttribute(
    'aria-disabled',
    'true',
  );

  await page.keyboard.press('c');
  await expect(menu(page)).toHaveCount(0);
  await expect(panel(page)).toBeVisible();

  /*
    The panel greets on open (Theme D), so the header passes through
    "Saying hello…" before it comes back to rest. Asserting the *destination*
    rather than the instant: `toHaveText` retries, so this is the honest
    reading of "the greeting runs and finishes", and it would fail both for a
    greeting that never started and for one that wedged half way.
  */
  await expect(page.getByTestId('companion-thread')).toContainText('midnite-studio');
  await expect(page.getByTestId('companion-state-label')).toHaveText('Ready');
});

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

test('typing a message posts it into the thread, and Escape clears without closing', async ({
  page,
}) => {
  await seedCompanionEnabled(page);
  await open(page);
  await page.keyboard.press('Meta+l');
  await page.keyboard.press('c');
  await expect(panel(page)).toBeVisible();

  // Not the empty state any more: Theme D greets on open, so what a freshly
  // opened panel shows is the overview built from the snapshot.
  await expect(page.getByTestId('companion-thread')).toContainText('midnite-studio');
  await expect(page.getByTestId('companion-state-label')).toHaveText('Ready');

  const input = page.getByTestId('companion-input');
  await input.fill('start an adhoc task');
  // Shift+Enter is a newline, not a send — the multi-line case an agent prompt
  // actually needs.
  await input.press('Shift+Enter');
  // Still nothing sent — the turn count is what says so now that the thread is
  // never empty.
  await expect(page.getByTestId('companion-thread')).not.toContainText('start an adhoc task');

  await input.press('Enter');
  await expect(page.getByTestId('companion-thread')).toContainText('start an adhoc task');
  await expect(input).toHaveValue('');

  await input.fill('never mind');
  await input.press('Escape');
  await expect(input).toHaveValue('');
  // Escape inside the textarea clears the field. It does NOT close the panel:
  // this is a layout column, not an overlay on Phase 62's stack.
  await expect(panel(page)).toBeVisible();
});

test('the mic is enabled out of the box, with no key configured at all', async ({ page }) => {
  // Ad Hoc: the microphone must work with no API key. `mock-bridge.ts`'s
  // default `sttStatus` now answers `whisper-local` implemented and ready
  // with nothing configured — the fresh-install state this is for.
  await seedCompanionEnabled(page);
  await open(page);
  await page.keyboard.press('Meta+l');
  await page.keyboard.press('c');

  const mic = page.getByTestId('companion-mic');
  await expect(mic).not.toHaveAttribute('aria-disabled', 'true');
  await mic.hover();
  await expect(page.getByRole('tooltip')).toContainText('Hold to talk');
});

test('the mic is disabled with the reason that names where to fix it', async ({ page }) => {
  // The one way the key-free default can still fail: its own native module
  // didn't load, with no other provider configured to fall back to.
  await seedCompanionEnabled(page);
  await open(page);
  await page.evaluate(() => {
    const bridge = window.midniteStudio;
    if (bridge?.companion) {
      bridge.companion.sttStatus = () =>
        Promise.resolve({
          configured: [],
          encryptionAvailable: true,
          implemented: ['whisper-local'],
          localModel: {
            state: 'failed' as const,
            reason: 'native-module-missing' as const,
            message: 'no prebuilt binary for this platform',
          },
        });
    }
  });
  await page.keyboard.press('Meta+l');
  await page.keyboard.press('c');

  const mic = page.getByTestId('companion-mic');
  await expect(mic).toHaveAttribute('aria-disabled', 'true');
  await mic.hover();
  await expect(page.getByText(/offline speech engine isn.t available/)).toBeVisible();
});

test('the popover mirrors the last companion turn once there is one', async ({ page }) => {
  await seedCompanionEnabled(page);
  await open(page);
  await page.keyboard.press('Meta+l');
  await page.keyboard.press('c');
  await expect(panel(page)).toBeVisible();

  await page.getByTestId('companion-input').fill('hello');
  await page.getByTestId('companion-input').press('Enter');

  await page.keyboard.press('Meta+l');
  await expect(menu(page)).toBeVisible();
  // The state label, from the same table the panel header and the FAB read.
  await expect(menu(page).getByTestId('companion-strip')).toContainText('Ready');
  /*
    The Repeat row is now *there*, and its presence is the assertion: the
    companion has greeted (Theme D), so there is a last companion turn to say
    again. This asserted `toHaveCount(0)` while `greet` was a no-op and the
    only turn in the thread was the user's.
  */
  await expect(menu(page).getByTestId('quick-access-row-r')).toHaveCount(1);
});

/**
 * The Phase 79 follow-up — the three things the user asked for, from the
 * outside.
 *
 * Only the parts that are observable in a browser: the consolidated turn's
 * *formatting* (a `<strong>` and a `<code>` inside one bubble, not twelve
 * bubbles of plain text), the per-turn timestamp element, and the day rule.
 * The speaking half is asserted in `register-flow-ports.test.tsx` — headless
 * Chromium's `speechSynthesis` is a stub here by construction (see the top of
 * this file), so a spec claiming to hear something would be asserting the
 * stub.
 */
test('the greeting arrives as one formatted turn, not a stack of fragments', async ({ page }) => {
  await seedCompanionEnabled(page);
  await open(page);
  await page.keyboard.press('Meta+l');
  await page.keyboard.press('c');
  await expect(panel(page)).toBeVisible();
  await expect(page.getByTestId('companion-state-label')).toHaveText('Ready');

  const thread = page.getByTestId('companion-thread');
  const companionTurns = thread.locator('[data-turn-role="companion"]');
  /*
    Three at most — greeting, overview, prompt — and this is the whole of the
    second fix. Before it, the same greeting produced six to twelve rows, each
    one sentence long.
  */
  const count = await companionTurns.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(3);

  // The overview turn is markdown: the repo name is bold and the branch is
  // inline code, inside one bubble.
  await expect(thread.locator('[data-turn-role="companion"] strong').first()).toHaveText(
    'midnite-studio',
  );
  await expect(thread.locator('[data-turn-role="companion"] code').first()).toBeVisible();
  // And the digest's PR titles are links, through `ExternalLink` — a real
  // href, activated into the embedded browser rather than replacing the SPA.
  await expect(
    thread.locator('[data-turn-role="companion"] a[href*="/pull/265"]'),
  ).toHaveCount(1);
});

test('every turn carries a timestamp, and the day it belongs to is ruled off', async ({ page }) => {
  await seedCompanionEnabled(page);
  await open(page);
  await page.keyboard.press('Meta+l');
  await page.keyboard.press('c');
  await expect(panel(page)).toBeVisible();
  await expect(page.getByTestId('companion-state-label')).toHaveText('Ready');

  const thread = page.getByTestId('companion-thread');
  const stamps = thread.locator('[data-turn-at]');
  await expect(stamps.first()).toBeVisible();

  // The attribute carries the raw epoch, so the assertion does not depend on
  // the runner's timezone; the visible text is the locale's own short time.
  const at = await stamps.first().getAttribute('data-turn-at');
  expect(Number(at)).toBeGreaterThan(0);
  await expect(stamps.first()).toHaveText(/\d{1,2}[:.]\d{2}/);
  // The full instant on hover is where the date and the seconds live.
  await expect(stamps.first()).toHaveAttribute('title', /\d{4}/);

  // One rule above the first turn — a persisted transcript routinely opens on
  // a different day, so the top of the thread always says which day it is.
  await expect(thread.locator('[data-turn-day]').first()).toHaveText('Today');

  // A turn the user sends now gets its own stamp in the same gutter.
  const before = await stamps.count();
  await page.getByTestId('companion-input').fill('hello');
  await page.getByTestId('companion-input').press('Enter');
  await expect(thread.locator('[data-turn-role="user"] [data-turn-at]')).toHaveCount(1);
  expect(await stamps.count()).toBeGreaterThan(before);
});

test('Settings ▸ Companion ▸ Voice carries the speak-aloud switch, on by default', async ({
  page,
}) => {
  await seedCompanionEnabled(page);
  await open(page);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'Companion', exact: true })
    .click();

  const speak = page.getByTestId('companion-speak-aloud');
  // The one `companion*` switch that starts on: enabling the companion is
  // already the decision to be spoken to, and Phase 79 shipped mute because
  // nothing joined `setCompanionSpeaker` to `companionTtsSpeaker`.
  await expect(speak).toBeChecked();
  await expect(speak).toBeEnabled();

  await speak.uncheck();
  await expect(speak).not.toBeChecked();
  // Turning speech off must not disable the thread — and it takes the voice
  // preview with it, because there is nothing left to preview.
  await expect(page.getByTestId('companion-say-hello')).toBeDisabled();
});

/**
 * The Clear-conversation control in the header.
 *
 * The one case in this file where the greeting is a *fixture* rather than the
 * thing asserted: the panel opens with three companion turns in it, which is
 * exactly the state a clear control needs to have something to clear. So the
 * spec walks the whole gate — the button dead before there is anything, live
 * once the greeting lands, a Cancel that changes nothing, and only the
 * confirm's own button emptying the thread onto its empty state.
 */
test('the header clears the conversation, behind a confirm that names the count', async ({
  page,
}) => {
  await seedCompanionEnabled(page);
  await open(page);
  await page.keyboard.press('Meta+l');
  await page.keyboard.press('c');
  await expect(panel(page)).toBeVisible();
  // The greeting has to have *finished* before the count in the confirm means
  // anything — "Ready" is how this file already says so.
  await expect(page.getByTestId('companion-state-label')).toHaveText('Ready');
  await expect(page.getByTestId('companion-thread')).toContainText('midnite-studio');

  const clear = page.getByTestId('companion-clear');
  await expect(clear).toBeVisible();
  await expect(clear).not.toHaveAttribute('aria-disabled', 'true');

  await clear.click();
  /*
    The blast radius. A conversation has no commits to list, so the count is
    the whole of it — asserted as a pattern rather than a literal because the
    greeting's turn count is `concierge.ts`'s business, not this spec's.
  */
  const confirm = page.getByRole('dialog');
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText(/Clear \d+ turns?\?/);
  await expect(confirm).toContainText('This cannot be undone.');

  // Cancel changes nothing — the gate is half the point of the control.
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByTestId('companion-thread')).toContainText('midnite-studio');

  await clear.click();
  // Scoped to the dialog: "Clear conversation" is the accessible name of the
  // header button as well, on purpose.
  await page.getByRole('dialog').getByRole('button', { name: 'Clear conversation' }).click();

  await expect(page.getByTestId('companion-thread')).toContainText('Nothing said yet');
  // Dead again, with nothing left to lose — and no second greeting refilling
  // the thread the user just emptied (`greeted` is a per-mount ref).
  await expect(clear).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('companion-state-label')).toHaveText('Ready');
  await expect(page.getByTestId('companion-thread')).toContainText('Nothing said yet');
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
