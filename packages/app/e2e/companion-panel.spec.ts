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
 * **What this spec deliberately does not assert, and why.** The phase's own
 * Theme H bullet asks for "the greeting turn renders" and "a new terminal
 * session appears with the skill string typed and not executed". Both belong
 * to themes that are not in this PR: the greeting is Theme D's `greet()`, and
 * the hand-off is Theme E's `parseIntent` → `useSkillHandoff`. Theme C ships
 * the seam they arrive through (`companion-ports.ts`), whose defaults are
 * no-ops — so a spec asserting a greeting today would be asserting a stub.
 * What is asserted instead is everything the panel itself owns: the switch
 * gates it, `C` opens it, the input bar posts a turn, the thread renders it,
 * and the state attribute the FAB choreography keys off is on the elements it
 * is supposed to be on.
 */

/** Enough of the Web Speech and WebAudio surfaces for the app to boot without them. */
async function stubSpeechAndAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const noop = () => {};
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak: noop,
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
      const persisted = stored ? JSON.parse(stored) : { version: 12 };
      persisted.state = { ...persisted.state, companionEnabled: true };
      localStorage.setItem('midnite-studio.ui', JSON.stringify(persisted));
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

  // The empty state first — a thread with nothing in it says so rather than
  // showing a blank column.
  await expect(page.getByTestId('companion-thread')).toContainText('Nothing said yet');

  const input = page.getByTestId('companion-input');
  await input.fill('start an adhoc task');
  // Shift+Enter is a newline, not a send — the multi-line case an agent prompt
  // actually needs.
  await input.press('Shift+Enter');
  await expect(page.getByTestId('companion-thread')).toContainText('Nothing said yet');

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

test('the mic is disabled with the reason that names where to fix it', async ({ page }) => {
  await seedCompanionEnabled(page);
  await open(page);
  await page.keyboard.press('Meta+l');
  await page.keyboard.press('c');

  const mic = page.getByTestId('companion-mic');
  await expect(mic).toHaveAttribute('aria-disabled', 'true');
  await mic.hover();
  await expect(page.getByText('add a speech key in Settings ▸ Companion')).toBeVisible();
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
  // No Repeat row: the only turn so far is the USER's, and there is nothing
  // the companion said to say again.
  await expect(menu(page).getByTestId('quick-access-row-r')).toHaveCount(0);
});
