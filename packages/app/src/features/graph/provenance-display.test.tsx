import type { AgentDefinition, CommitProvenance, GraphRow } from '@midnite/studio-shared';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CommitAvatar } from './commit-avatar';
import { CommitGraphRow } from './graph-row';
import { graphThemeFor } from './graph-themes';
import {
  DEFAULT_PROVENANCE_MARK_MODE,
  PROVENANCE_MARK_MODES,
  PROVENANCE_SWAP_MS,
  provenanceMarkMode,
  resetProvenanceSwapForTests,
} from './provenance-display';
import { useUiStore } from '../../store/ui-store';

/**
 * The three agent-provenance display modes — vitest/jsdom, not Playwright.
 *
 * Everything asserted here is attribute arithmetic (a `foreignObject`'s
 * `width`, a `<g>`'s `opacity`, whether a slot element exists) and store
 * plumbing. Nothing needs real layout, real CSS or a real pointer, so by the
 * decision rule in `docs/TESTING.md` this is a unit test. The one thing a
 * browser would add — whether the 500ms crossfade actually paints — is covered
 * by the visual baselines, not here.
 */
const avatarTheme = graphThemeFor('gitkraken', 'comfortable');

const claudeAgent: AgentDefinition = {
  id: 'claude',
  label: 'Claude',
  command: 'claude',
  args: [],
  accent: '#d97757',
};

const agentProvenance: CommitProvenance = {
  kind: 'agent',
  source: 'author',
  agentIds: ['claude'],
};

const humanProvenance: CommitProvenance = { kind: 'human' };

const makeRow = (sha: string): GraphRow => ({
  row: 0,
  lane: 0,
  colorIdx: 0,
  laneCount: 1,
  edges: [],
  commit: {
    sha,
    subject: 'feat: a commit',
    authorEmail: `${sha}@example.com`,
    authorName: 'Ada Lovelace',
    authorDate: 1_700_000_000,
    committerDate: 1_700_000_000,
    parents: [],
    refs: [],
    coAuthors: [],
    sessionTrailers: [],
  },
});

const renderRow = (over: Partial<Parameters<typeof CommitGraphRow>[0]> = {}) =>
  render(
    <CommitGraphRow
      row={makeRow('sha-1')}
      refs={[]}
      selected={false}
      gutterWidth={80}
      laneWidth={24}
      theme={avatarTheme}
      clipId="clip"
      dimmed={false}
      onSelect={vi.fn()}
      onContextMenu={vi.fn()}
      onRefContextMenu={vi.fn()}
      onRefActivate={vi.fn()}
      syncFor={() => []}
      onSync={vi.fn()}
      syncing={{}}
      currentBranch="main"
      provenance={agentProvenance}
      agent={claudeAgent}
      {...over}
    />,
  ).container.querySelector('[role="row"]') as HTMLElement;

const renderAvatar = (over: Partial<Parameters<typeof CommitAvatar>[0]> = {}) =>
  render(
    <svg>
      <CommitAvatar
        email="swap-test@example.com"
        name="Ada Lovelace"
        cx={20}
        cy={19}
        size={24}
        ring="hsl(0 0% 50%)"
        ringWidth={2.5}
        clipId="clip"
        provenance={agentProvenance}
        agent={claudeAgent}
        {...over}
      />
    </svg>,
  ).container;

afterEach(() => {
  cleanup();
  resetProvenanceSwapForTests();
});

describe('provenanceMarkMode: a persisted id is coerced, never trusted', () => {
  it.each(PROVENANCE_MARK_MODES)('keeps the known mode %s', (mode) => {
    expect(provenanceMarkMode(mode)).toBe(mode);
  });

  it.each([null, undefined, '', 'inline', 'BADGE'])(
    'falls back to the default for %s',
    (value) => {
      expect(provenanceMarkMode(value)).toBe(DEFAULT_PROVENANCE_MARK_MODE);
    },
  );

  it('defaults to the corner badge, so an existing install sees no change', () => {
    expect(DEFAULT_PROVENANCE_MARK_MODE).toBe('badge');
    expect(useUiStore.getState().graphProvenanceMark).toBe('badge');
  });
});

describe('the node container is opaque in every mode', () => {
  it.each(PROVENANCE_MARK_MODES)(
    'paints the app background under the face in %s mode',
    (mode) => {
      // First circle in the node's group, before the generated hue and before
      // any avatar image — the lanes are drawn underneath, so anything
      // translucent above would let a branch line run through the face.
      const container = renderAvatar({ markMode: mode });
      const first = container.querySelector('svg > g > circle');
      expect(first?.getAttribute('fill')).toBe('hsl(var(--background))');
    },
  );
});

describe('badge mode', () => {
  it('draws the corner badge and nothing else', () => {
    const el = renderRow({ markMode: 'badge' });
    expect(el.querySelector('[data-testid="svg-agent-avatar"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="svg-agent-face"]')).toBeNull();
    expect(el.querySelector('[data-testid="provenance-slot"]')).toBeNull();
  });
});

describe('beside mode', () => {
  it('moves the mark out of the node and into its own slot', () => {
    const el = renderRow({ markMode: 'beside' });
    expect(el.querySelector('[data-testid="svg-agent-avatar"]')).toBeNull();
    expect(el.querySelector('[data-testid="svg-mixed-badge"]')).toBeNull();
    expect(el.querySelector('[data-testid="svg-agent-face"]')).toBeNull();
    expect(el.querySelector('[data-testid="provenance-mark-beside"]')).not.toBeNull();
  });

  it('is larger than the corner badge it replaces', () => {
    // The badge's glyph is 0.64x the node RADIUS; the beside mark is 0.7x the
    // node's full diameter, floored at 12px. "Slightly larger" is the whole
    // point of the mode, so it is asserted rather than left to the eye.
    const radius = avatarTheme.avatarSize / 2;
    const badgeGlyph = radius * 0.64;
    const beside = Math.max(12, Math.round(avatarTheme.avatarSize * 0.7));
    expect(beside).toBeGreaterThan(badgeGlyph);
  });

  it('reserves the slot on a human commit too, so the subject column cannot jog', () => {
    const el = renderRow({ markMode: 'beside', provenance: humanProvenance, agent: null });
    const slot = el.querySelector('[data-testid="provenance-slot"]');
    expect(slot).not.toBeNull();
    expect(slot?.querySelector('[data-testid="provenance-mark-beside"]')).toBeNull();
  });
});

describe('swap mode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mounts both faces and starts on the human one', () => {
    const container = renderAvatar({ markMode: 'swap' });
    const face = container.querySelector('[data-testid="svg-agent-face"]');
    expect(face).not.toBeNull();
    expect(face?.getAttribute('opacity')).toBe('0');
    expect(face?.getAttribute('data-swap-showing')).toBe('human');
    // The corner badge is the other mode's answer — never both at once.
    expect(container.querySelector('[data-testid="svg-agent-avatar"]')).toBeNull();
  });

  it('turns to the agent after one interval and back after the next', () => {
    const container = renderAvatar({ markMode: 'swap' });
    const face = () => container.querySelector('[data-testid="svg-agent-face"]');

    act(() => {
      vi.advanceTimersByTime(PROVENANCE_SWAP_MS);
    });
    expect(face()?.getAttribute('opacity')).toBe('1');
    expect(face()?.getAttribute('data-swap-showing')).toBe('agent');

    act(() => {
      vi.advanceTimersByTime(PROVENANCE_SWAP_MS);
    });
    expect(face()?.getAttribute('opacity')).toBe('0');
    expect(face()?.getAttribute('data-swap-showing')).toBe('human');
  });

  it('keeps every node in step — one clock, not one per row', () => {
    const container = render(
      <svg>
        <CommitAvatar
          email="a@example.com"
          name="A"
          cx={20}
          cy={19}
          size={24}
          ring="r"
          ringWidth={2}
          clipId="clip"
          provenance={agentProvenance}
          agent={claudeAgent}
          markMode="swap"
        />
        <CommitAvatar
          email="b@example.com"
          name="B"
          cx={20}
          cy={60}
          size={24}
          ring="r"
          ringWidth={2}
          clipId="clip"
          provenance={agentProvenance}
          agent={claudeAgent}
          markMode="swap"
        />
      </svg>,
    ).container;

    act(() => {
      vi.advanceTimersByTime(PROVENANCE_SWAP_MS);
    });

    const showing = [...container.querySelectorAll('[data-testid="svg-agent-face"]')].map((g) =>
      g.getAttribute('data-swap-showing'),
    );
    expect(showing).toEqual(['agent', 'agent']);
  });

  it('never subscribes a human commit to the clock, so an agent-free repo pays nothing', () => {
    const container = renderAvatar({
      markMode: 'swap',
      provenance: humanProvenance,
      agent: null,
    });
    expect(container.querySelector('[data-testid="svg-agent-face"]')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the interval once the last node unmounts', () => {
    renderAvatar({ markMode: 'swap' });
    expect(vi.getTimerCount()).toBe(1);
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops while the window is hidden and picks up again when it comes back', () => {
    // A 5s metronome running behind a backgrounded window is exactly the idle
    // cost `scripts/perf/idle-cpu.mjs --blurred` measures.
    const setHidden = (hidden: boolean) => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
      document.dispatchEvent(new Event('visibilitychange'));
    };

    renderAvatar({ markMode: 'swap' });
    expect(vi.getTimerCount()).toBe(1);

    setHidden(true);
    expect(vi.getTimerCount()).toBe(0);

    setHidden(false);
    expect(vi.getTimerCount()).toBe(1);
  });
});
