import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AgentMarquee,
  BAND_PX,
  CAPTION_GAP_PX,
  CAPTION_PX,
  CYCLE_MS,
  HALO_REACH_PX,
  HOLD_SCALE,
  PEAK_SCALE,
} from './agent-marquee';
import { SITE_AGENTS } from './agents';

const setReducedMotion = (reduced: boolean) => {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: reduced && query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
};

/**
 * Every rendering of a given agent's *mark*, across all three roster copies.
 *
 * Scoped to `.ws-agent-mark` rather than to `[data-agent]` alone: the name
 * caption carries the same attribute, and counting it as a fourth copy is a
 * fine way to make this file fail for a reason that has nothing to do with the
 * marquee.
 */
const slotsFor = (id: string) =>
  Array.from(document.querySelectorAll(`.ws-agent-mark[data-agent="${id}"]`));

const selectedIds = () =>
  Array.from(document.querySelectorAll('.ws-agent-mark[data-selected="true"]')).map((node) =>
    node.getAttribute('data-agent'),
  );

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('AgentMarquee', () => {
  describe('with motion', () => {
    beforeEach(() => {
      setReducedMotion(false);
      vi.useFakeTimers();
    });

    it('renders the roster three times, so the loop has content either side', () => {
      render(<AgentMarquee />);
      for (const agent of SITE_AGENTS) {
        expect(slotsFor(agent.id), agent.id).toHaveLength(3);
      }
    });

    it('names every agent once, as text, for a screen reader', () => {
      render(<AgentMarquee />);
      // The logos themselves are aria-hidden — thirty unlabelled images is not
      // what a screen reader wants from a decorative band.
      const names = screen.getByText(SITE_AGENTS.map((a) => a.label).join(', '));
      expect(names.className).toContain('sr-only');
    });

    it('selects exactly one logo, and advances to the next on the cycle', () => {
      render(<AgentMarquee />);
      const first = SITE_AGENTS[0]?.id;
      const second = SITE_AGENTS[1]?.id;

      // One logo selected, in all three copies — the geometry guarantees only
      // one of the three can be on screen, so they light together.
      expect(new Set(selectedIds())).toEqual(new Set([first]));
      expect(selectedIds()).toHaveLength(3);

      act(() => void vi.advanceTimersByTime(CYCLE_MS / 2 + 1));
      expect(new Set(selectedIds())).toEqual(new Set([second]));
    });

    it('pauses the track on hover and resumes on leave', () => {
      render(<AgentMarquee />);
      const band = screen.getByTestId('agent-marquee');
      const track = band.firstElementChild;

      expect(track?.getAttribute('data-paused')).toBe('false');

      fireEvent.mouseEnter(band);
      expect(track?.getAttribute('data-paused')).toBe('true');

      // Frozen, not merely un-ticked: a whole pass of wall clock while hovered
      // must leave the same logo lit, or the cycle desyncs from the scroll.
      const lit = selectedIds();
      act(() => void vi.advanceTimersByTime(CYCLE_MS * SITE_AGENTS.length));
      expect(selectedIds()).toEqual(lit);

      fireEvent.mouseLeave(band);
      expect(track?.getAttribute('data-paused')).toBe('false');
    });

    it('pauses while the tab is hidden', () => {
      render(<AgentMarquee />);
      const track = screen.getByTestId('agent-marquee').firstElementChild;

      const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
      act(() => void document.dispatchEvent(new Event('visibilitychange')));
      expect(track?.getAttribute('data-paused')).toBe('true');

      hidden.mockReturnValue(false);
      act(() => void document.dispatchEvent(new Event('visibilitychange')));
      expect(track?.getAttribute('data-paused')).toBe('false');
      hidden.mockRestore();
    });

    it('gives the track every custom property the arithmetic depends on', () => {
      render(<AgentMarquee />);
      const track = screen.getByTestId('agent-marquee').firstElementChild as HTMLElement;
      const count = SITE_AGENTS.length;

      // The shift must be exactly one copy's width and the pass exactly one
      // cycle per logo. If either drifts from the other, the selected logo
      // stops being the one at the centre — which is the whole bug this
      // section is built to avoid.
      expect(track.style.getPropertyValue('--ws-agent-slot')).toBe('152px');
      expect(track.style.getPropertyValue('--ws-agent-shift')).toBe(`${152 * count}px`);
      expect(track.style.getPropertyValue('--ws-agent-pass')).toBe(`${CYCLE_MS * count}ms`);
      expect(track.style.getPropertyValue('--ws-agent-cycle')).toBe(`${CYCLE_MS}ms`);
      expect(track.style.getPropertyValue('--ws-agent-lead')).toBe(
        `${152 * count + 76}px`,
      );

      /*
        The bounce's two sizes come from here too, rather than being written
        into `@keyframes ws-agent-bounce`. That is what makes the band's height
        below provably tall enough: the peak the keyframe reaches and the peak
        the height is derived from are the same value, not two copies of it.
      */
      expect(track.style.getPropertyValue('--ws-agent-scale')).toBe(String(HOLD_SCALE));
      expect(track.style.getPropertyValue('--ws-agent-peak')).toBe(String(PEAK_SCALE));
      expect(PEAK_SCALE).toBeGreaterThan(HOLD_SCALE);
    });

    it('runs the whole band at least 1.4x slower than the 1900ms it shipped at', () => {
      /*
        The scroll and the per-logo cycle are two readings of `CYCLE_MS`, so
        this one assertion covers both: the track travels `SLOT_PX` per cycle,
        and the selected logo's spin-hold-spin is exactly one cycle long.
      */
      expect(CYCLE_MS / 1900).toBeGreaterThanOrEqual(1.4);
    });

    it('captions the selected logo, and follows it to the next one', () => {
      render(<AgentMarquee />);
      const caption = () => screen.getByTestId('agent-caption');

      expect(caption().getAttribute('data-agent')).toBe(SITE_AGENTS[0]?.id);

      act(() => void vi.advanceTimersByTime(CYCLE_MS / 2 + 1));
      expect(caption().getAttribute('data-agent')).toBe(SITE_AGENTS[1]?.id);
      // Never a name from one logo under the glow of another.
      expect(caption().getAttribute('data-agent')).toBe(
        document.querySelector('[data-selected="true"]')?.getAttribute('data-agent'),
      );
    });

    it('types the name out rather than printing it', () => {
      render(<AgentMarquee />);
      const name = () => screen.getByTestId('agent-caption-name').textContent;
      const label = SITE_AGENTS[0]!.label;

      expect(name()).toBe('');
      act(() => void vi.advanceTimersByTime(70));
      expect(name()).toBe(label.slice(0, 1));

      act(() => void vi.advanceTimersByTime(62 * label.length));
      expect(name()).toBe(label);
    });

    it('takes each name`s colour from the roster, gradient where a brand has two', () => {
      render(<AgentMarquee />);
      const name = () => screen.getByTestId('agent-caption-name') as HTMLElement;

      for (const [index, agent] of SITE_AGENTS.entries()) {
        if (index > 0) act(() => void vi.advanceTimersByTime(CYCLE_MS));
        expect(screen.getByTestId('agent-caption').getAttribute('data-agent')).toBe(agent.id);

        if (agent.colorEnd) {
          expect(name().dataset.gradient, agent.id).toBe('true');
          expect(name().style.backgroundImage, agent.id).toContain(agent.color);
          expect(name().style.backgroundImage, agent.id).toContain(agent.colorEnd);
        } else {
          expect(name().dataset.gradient, agent.id).toBe('false');
          expect(name().style.color, agent.id).not.toBe('');
        }
      }
    });

    it('reserves the caption`s height, so no character lands as a layout jump', () => {
      render(<AgentMarquee />);
      const caption = screen.getByTestId('agent-caption');
      expect(caption.style.height).toBe(`${CAPTION_PX}px`);
      expect(caption.style.marginTop).toBe(`${CAPTION_GAP_PX}px`);
    });

    it('keeps the caption clear of the halo at the bounce`s peak', () => {
      /*
        The halo is painted `HALO_REACH_PX / 2` either side of the band's centre
        line, so it stops short of the band's own edge by the slack the height
        was given. The caption starts below that edge, so the two cannot meet —
        and neither is clipped, since the `overflow-hidden` ends with the band.
      */
      const slackBelowBand = BAND_PX / 2 - HALO_REACH_PX / 2;
      expect(slackBelowBand).toBeGreaterThan(0);
      expect(CAPTION_GAP_PX).toBeGreaterThan(0);
    });

    it('makes the band tall enough for the glow at its peak scale', () => {
      /*
        The band clips, and must — the horizontal clip is what makes a marquee.
        Clipping vertically just cuts the top and bottom off the selected logo's
        halo, which is what this height exists to prevent: the halo is the mark
        (56px) plus its `-inset-3` (2 x 12px) at the bounce's peak.
      */
      render(<AgentMarquee />);
      const band = screen.getByTestId('agent-marquee');

      expect(band.style.height).toBe(`${BAND_PX}px`);
      expect(BAND_PX).toBeGreaterThanOrEqual((56 + 24) * PEAK_SCALE);
      // The old `h-44` (176px) is what was cutting it off.
      expect(band.className).not.toContain('h-44');
    });

  });

  describe('under reduced motion', () => {
    beforeEach(() => setReducedMotion(true));

    it('shows a static grid instead of the marquee', () => {
      render(<AgentMarquee />);
      expect(screen.queryByTestId('agent-marquee')).toBeNull();
      expect(screen.getByTestId('agent-grid')).toBeTruthy();
    });

    it('labels every logo, once, and never repeats the roster', () => {
      render(<AgentMarquee />);
      for (const agent of SITE_AGENTS) {
        expect(screen.getByText(agent.label)).toBeTruthy();
      }
      expect(screen.getByTestId('agent-grid').children).toHaveLength(
        SITE_AGENTS.length,
      );
    });

    it('shows every name as a plain label instead of a typed caption', () => {
      render(<AgentMarquee />);
      expect(screen.queryByTestId('agent-caption')).toBeNull();
      for (const agent of SITE_AGENTS) {
        const label = screen.getByText(agent.label);
        expect(label.className).toContain('text-fg-subtle');
      }
    });

    it('runs no timeline at all', () => {
      const spy = vi.spyOn(window, 'setTimeout');
      render(<AgentMarquee />);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
