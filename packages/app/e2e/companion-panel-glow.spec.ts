import { expect, test, type Page } from '@playwright/test';

import { decodePng, pixelAt, type Raster } from './png-pixels';
import { installShotsBridge } from './shots-helper';

/**
 * The docked companion panel's three reads, asserted in PIXELS.
 *
 * This spec exists because the previous fix for this bug passed every test
 * there was and did not work. `companion-glow.test.ts` parses the stylesheet
 * and can prove a rule says `inset`; `companion-panel.test.tsx` can prove the
 * class is on the element. Neither can prove anything reached the
 * framebuffer — and what was actually wrong was amplitude, a glow calibrated
 * for a 32px FAB painted inward along a 360×800px panel edge, which is
 * invisible while being, on every textual measure, correct.
 *
 * So: drive the real panel through each state, screenshot it, decode the PNG
 * and sample the light along its edge. Every number below is a ratio against
 * the same frame's own interior rather than an absolute, so a theme change or
 * a different transcript moves both terms and the assertion still means
 * "the edge is lit relative to the middle".
 */

/** Enough of Web Speech for the app to boot headless; the panel greets on mount. */
async function open(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const noop = () => {};
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
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
    try {
      const stored = localStorage.getItem('midnite-studio.ui');
      const persisted = stored ? JSON.parse(stored) : { version: 12 };
      persisted.state = { ...persisted.state, companionEnabled: true };
      localStorage.setItem('midnite-studio.ui', JSON.stringify(persisted));
    } catch {
      /* Unparseable profile — the app discards it too. */
    }
  });
  await installShotsBridge(page, {});
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  // Motion ON: two of the three states under test ARE animations, and the
  // reduced-motion fallback is asserted separately at the end of this file.
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    document.documentElement.setAttribute('data-motion', 'full');
  });
  await page.keyboard.press('Meta+l');
  await page.keyboard.press('c');
  await expect(page.getByTestId('companion-panel')).toBeVisible();
}

/**
 * Put the panel in `state` (absent attribute for idle) at speech level
 * `level`.
 *
 * The attribute is set directly rather than by driving the state machine to
 * each value, the same choice `companion-shots.spec.ts` makes and for the
 * same reason: `thinking`, `handoff` and a sustained `speaking` are only
 * reachable through machinery this spec is not testing, and the attribute is
 * the entire input to the CSS under test. `--companion-level` goes on the
 * root because that is precisely where `speaker.ts` writes it.
 */
async function setState(page: Page, state: string | null, level = 0): Promise<void> {
  await page.evaluate(
    ({ next, lvl }) => {
      const el = document.querySelector('[data-testid="companion-panel"]')!;
      if (next) el.setAttribute('data-companion-state', next);
      else el.removeAttribute('data-companion-state');
      document.documentElement.style.setProperty('--companion-level', String(lvl));
    },
    { next: state, lvl: level },
  );
  await page.waitForTimeout(350);
}

/** Mean luminance of the one-pixel ring `depth` inside the raster's edge. */
function ringMean(raster: Raster, depth: number): number {
  let sum = 0;
  let n = 0;
  const add = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= raster.width || y >= raster.height) return;
    const [r, g, b] = pixelAt(raster, x, y);
    sum += r + g + b;
    n += 1;
  };
  for (let x = depth; x < raster.width - depth; x += 3) {
    add(x, depth);
    add(x, raster.height - 1 - depth);
  }
  for (let y = depth; y < raster.height - depth; y += 3) {
    add(depth, y);
    add(raster.width - 1 - depth, y);
  }
  return sum / n / 3;
}

/**
 * How much brighter the panel's edge REGION is than its own interior, in this
 * frame.
 *
 * Averaged over four depths rather than read at one, and the shallowest is
 * 4px in rather than 1px. Both choices are what make this measure the bug.
 * The state that shipped broken drew a 4px inset ring, which at a single
 * one-pixel depth measures about as bright as the fix does — it is simply
 * gone by the sixth pixel, where the fix still reaches thirty-odd. Sampling
 * across depth measures the glow's REACH, which is the thing a human sees;
 * starting at 4px keeps the panel's own hairline borders out of the number.
 *
 * `120px` is comfortably past the widest band any state paints (46px), so the
 * denominator is unlit panel and transcript in every state — which is what
 * makes this a ratio the theme and the conversation cannot move.
 */
async function edgeLift(page: Page): Promise<number> {
  const panel = page.getByTestId('companion-panel');
  const box = (await panel.boundingBox())!;
  const raster = decodePng(await page.screenshot({ clip: box }));
  const depths = [4, 10, 18, 28];
  const lit = depths.reduce((sum, d) => sum + ringMean(raster, d), 0) / depths.length;
  return lit / ringMean(raster, 120);
}

test('idle, thinking and speaking each light the panel edge, and each differently', async ({
  page,
}) => {
  await open(page);

  await setState(page, null);
  const idle = await edgeLift(page);
  await setState(page, 'thinking');
  const thinking = await edgeLift(page);
  await setState(page, 'speaking', 0.85);
  const speaking = await edgeLift(page);

  // Idle is the muted one, but it is not nothing. The version that shipped
  // broken measures 0.94 here — its 4px ring does not even reach as far as
  // the panel's own interior average, which is the bug report in one number.
  expect(idle, `idle edge lift ${idle}`).toBeGreaterThan(1.1);
  // …and each state is a clear step up from the one below it, so the three
  // are told apart at a glance rather than by comparison. (Broken: 1.13 and
  // 1.57 — thinking barely clearing idle, speaking barely clearing thinking.)
  expect(thinking, `thinking ${thinking} vs idle ${idle}`).toBeGreaterThan(idle * 1.15);
  expect(speaking, `speaking ${speaking} vs thinking ${thinking}`).toBeGreaterThan(thinking * 1.5);
});

test('the speaking glow tracks the level speaker.ts writes', async ({ page }) => {
  await open(page);

  await setState(page, 'speaking', 0);
  const quiet = await edgeLift(page);
  await setState(page, 'speaking', 0.35);
  const middling = await edgeLift(page);
  await setState(page, 'speaking', 0.85);
  const loud = await edgeLift(page);

  // The floor first. The local voice engine emits no word boundaries, so the
  // level genuinely sits at 0 for seconds at a time — a state that only lights
  // up on a pulse is a state nobody sees speak.
  expect(quiet, `speaking at level 0 lifted the edge by ${quiet}`).toBeGreaterThan(1.3);
  expect(middling).toBeGreaterThan(quiet);
  expect(loud).toBeGreaterThan(middling);
});

/**
 * The "matched up" requirement, in the rendered styles rather than the source.
 *
 * The arc lives in the host's own conic border and the bloom in its `::after`,
 * and they have to be the same object seen twice. One animated inheriting
 * angle is how that is guaranteed — so the proof is that the pseudo's
 * resolved gradient carries the SAME `from` angle as the host's, at an
 * arbitrary moment mid-rotation, and that the angle is moving at all.
 */
test('the idle arc and its bloom orbit on one timeline', async ({ page }) => {
  await open(page);
  await setState(page, null);

  const read = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-testid="companion-panel"]') as HTMLElement;
      const angleOf = (image: string): string => image.match(/from ([\d.]+deg)/)?.[1] ?? '';
      return {
        host: angleOf(getComputedStyle(el).backgroundImage),
        band: angleOf(getComputedStyle(el, '::after').backgroundImage),
      };
    });

  const first = await read();
  expect(first.host, 'the host ring should carry a resolved orbit angle').not.toBe('');
  expect(first.band, 'the bloom should carry the same angle, not its initial 0deg').toBe(first.host);

  await page.waitForTimeout(600);
  const second = await read();
  expect(second.band).toBe(second.host);
  expect(second.host, 'the orbit should have advanced').not.toBe(first.host);
});

test('idle orbits at a fifth of thinking, and both motion gates stop it', async ({ page }) => {
  await open(page);

  const duration = async (state: string | null): Promise<string> => {
    await setState(page, state);
    return page.evaluate(
      () =>
        getComputedStyle(document.querySelector('[data-testid="companion-panel"]')!)
          .animationDuration,
    );
  };

  expect(await duration(null)).toBe('15s');
  expect(await duration('thinking')).toContain('3s');

  await setState(page, null);
  await page.evaluate(() => document.documentElement.setAttribute('data-motion', 'reduced'));
  const still = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('[data-testid="companion-panel"]')!);
    return { name: cs.animationName, orbit: cs.getPropertyValue('--companion-orbit').trim() };
  });
  expect(still.name).toBe('none');
  // Pinned, not merely stopped: a frozen arc parked wherever the clock left it
  // reads as damage rather than as stillness.
  expect(still.orbit).toBe('200deg');

  await page.evaluate(() => {
    document.documentElement.setAttribute('data-motion', 'full');
    document.documentElement.setAttribute('data-window-focused', 'false');
  });
  expect(
    await page.evaluate(
      () =>
        getComputedStyle(document.querySelector('[data-testid="companion-panel"]')!)
          .animationPlayState,
    ),
  ).toBe('paused');
});
