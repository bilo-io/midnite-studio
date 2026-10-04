import { cleanup, render } from '@testing-library/react';
import css from 'virtual:midnite-styles-raw';
import { afterEach, describe, expect, it } from 'vitest';

import { MediaLayout } from './media-layout';
import { MEDIA_TABS } from '@midnite/studio-shared';

/**
 * The rainbow composer panel is CSS (`.rainbow-panel` in styles.css) applied once by `MediaLayout` to
 * its detail pane. jsdom cannot run an animation, so the motion contract is asserted where it is written:
 * in the stylesheet — the same seam `styles-motion-guards.test.ts` reads. (vitest/jsdom: text and
 * structure only; no browser capability is needed.)
 */
afterEach(cleanup);

/** The text of every rule block in `source` whose selector list mentions `needle`. */
const rulesMentioning = (needle: string): string[] =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1]!.includes(needle)).map((m) => `${m[1]!.trim()} { ${m[2]!.trim()} }`);

describe('rainbow composer panel', () => {
  it('every Media tab with a detail pane wears it, and a collapsed pane says so for the animation gate', () => {
    for (const tab of MEDIA_TABS) {
      const { container, unmount } = render(<MediaLayout tab={tab} explorer={<div />} content={<div />} detail={<div>composer</div>} />);
      const detail = container.querySelector('[data-media-pane="detail"]');
      expect(detail?.className, tab).toContain('rainbow-panel');
      unmount();
    }
  });

  it('is a conic ramp border plus an inner glow arc, both driven by one animated @property angle', () => {
    expect(css).toMatch(/@property --rainbow-panel-angle\s*\{[^}]*syntax:\s*'<angle>'/);
    expect(css).toMatch(/@keyframes rainbow-panel-spin\s*\{\s*to\s*\{\s*--rainbow-panel-angle:\s*360deg/);
    const rules = rulesMentioning('.rainbow-panel::before').join('\n');
    expect(rules).toContain('conic-gradient(from var(--rainbow-panel-angle), var(--rainbow-ramp))');
    expect(rulesMentioning('.rainbow-panel::after').join('\n')).toContain('filter: blur');
    // the resting glow is a plain box-shadow, which is what remains with motion off
    expect(css).toMatch(/\.rainbow-panel \{[^}]*box-shadow: inset/);
  });

  it('respects reduced motion: both OS preference and the app override stop the rotation', () => {
    const osRule = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*html:not\(\[data-motion='full'\]\) \.rainbow-panel::before,[^}]*\}/);
    expect(osRule?.[0]).toContain('animation: none');
    const appRule = rulesMentioning("html[data-motion='reduced'] .rainbow-panel::before");
    expect(appRule.join('\n')).toContain('animation: none');
  });

  it('adds no idle cost: paused by default, running only while the window is focused and the pane is open', () => {
    expect(rulesMentioning('.rainbow-panel::before,').join('\n')).toMatch(/animation: rainbow-panel-spin [^;]*infinite paused/);
    const running = rulesMentioning("html:not([data-window-focused='false']) .rainbow-panel:not([data-collapsed])::before").join('\n');
    expect(running).toContain('animation-play-state: running');
  });
});
