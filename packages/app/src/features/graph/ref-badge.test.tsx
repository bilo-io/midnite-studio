import type { Ref } from '@midnite/studio-shared';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import { graphThemeFor } from './graph-themes';
import { RefBadge } from './ref-badge';
import type { SyncAction } from './ref-sync';

const theme = graphThemeFor('default', 'comfortable');

const makeRef = (name: string, isHead = false): Ref => ({
  name,
  fullName: `refs/heads/${name}`,
  kind: 'localBranch',
  sha: 'abc1234',
  isHead,
  worktreePath: isHead ? '/wt/main' : null,
  upstream: null,
});

describe('RefBadge with agentActive glow', () => {
  afterEach(cleanup);

  it('renders RefBadge with standard styling when not active', () => {
    const ref = makeRef('feature/normal');
    const { container } = render(
      <RefBadge
        refItem={ref}
        colorIdx={2}
        palette={theme.palette}
        agentActive={false}
      />,
    );

    const badge = container.querySelector('[data-ref="refs/heads/feature/normal"]');
    expect(badge).toBeDefined();
    expect((badge as HTMLElement).style.boxShadow).toBe('');
  });

  it('renders RefBadge with no chip-level glow class when agentActive is true — the effect lives on HeadGlow and the portalled bleed instead', () => {
    const ref = makeRef('feature/active-agent');
    const { container } = render(
      <RefBadge
        refItem={ref}
        colorIdx={3}
        palette={theme.palette}
        agentActive={true}
      />,
    );

    const badge = container.querySelector(
      '[data-ref="refs/heads/feature/active-agent"]',
    ) as HTMLElement;
    expect(badge).toBeDefined();
    // The border ring and the bleeding halo are the whole effect now — see
    // `.ref-badge-agent-arc-ring` (in-row, `HeadGlow`) and
    // `.ref-badge-agent-arc-glow` (portalled, `RefAgentGlowBleed`) below.
    expect(badge.className).not.toContain('ref-badge-agent-glow');
    expect(badge.className).not.toContain('graph-badge-glow');
    expect(badge.style.boxShadow).toBe('');
  });

  it('renders the orbiting arc ring (not the lane sweep) when agentActive is true even if not head', () => {
    const ref = makeRef('feature/active-agent');
    const { container } = render(
      <RefBadge
        refItem={ref}
        colorIdx={3}
        palette={theme.palette}
        agentActive={true}
      />,
    );

    expect(container.querySelector('.ref-badge-agent-arc-ring')).not.toBeNull();
    expect(container.querySelector('.animate-lane-sweep')).toBeNull();
  });

  it('renders the plain lane sweep (not the arc ring) on the checked-out chip when no agent is active', () => {
    const ref = makeRef('feature/checked-out', true);
    const { container } = render(
      <RefBadge refItem={ref} colorIdx={1} palette={theme.palette} agentActive={false} />,
    );

    expect(container.querySelector('.animate-lane-sweep')).not.toBeNull();
    expect(container.querySelector('.ref-badge-agent-arc-ring')).toBeNull();
  });
});

describe('RefBadge with branchGlow', () => {
  afterEach(cleanup);

  it('renders RefBadge with graph-badge-glow class and full opacity when branchGlow is true', () => {
    const ref = makeRef('feature/highlighted');
    const { container } = render(
      <RefBadge
        refItem={ref}
        colorIdx={3}
        palette={theme.palette}
        branchGlow={true}
      />,
    );

    const badge = container.querySelector('[data-ref="refs/heads/feature/highlighted"]') as HTMLElement;
    expect(badge).not.toBeNull();
    expect(badge.className).toContain('graph-badge-glow');
    expect(badge.style.opacity).toBe('1');
  });

  it('renders resting opacity and no glow class when branchGlow is false', () => {
    const ref = makeRef('feature/unlit');
    const { container } = render(
      <RefBadge
        refItem={ref}
        colorIdx={3}
        palette={theme.palette}
        branchGlow={false}
      />,
    );

    const badge = container.querySelector('[data-ref="refs/heads/feature/unlit"]') as HTMLElement;
    expect(badge).not.toBeNull();
    expect(badge.className).not.toContain('graph-badge-glow');
    expect(badge.style.opacity).toBe('0.78');
  });
});

describe('RefBadge sync overlay occlusion (Phase 32 Theme E)', () => {
  afterEach(() => {
    cleanup();
    useUiStore.setState({ occluders: 0 });
  });

  const pushAction: SyncAction = {
    kind: 'push',
    label: 'Push 1 commit to origin/main',
    count: 1,
    disabled: false,
    remote: 'origin',
    branch: 'main',
    setUpstream: false,
  };

  it('registers as an occluder while the sync strip is open on hover, and clears on leave', () => {
    const ref = makeRef('feature/sync');
    const { container } = render(
      <RefBadge
        refItem={ref}
        colorIdx={1}
        palette={theme.palette}
        actions={[pushAction]}
        onSync={() => {}}
      />,
    );

    const wrapper = container.querySelector('[data-ref="refs/heads/feature/sync"]')
      ?.parentElement as HTMLElement;
    expect(useUiStore.getState().occluders).toBe(0);

    fireEvent.mouseEnter(wrapper);
    expect(useUiStore.getState().occluders).toBe(1);

    vi.useFakeTimers();
    fireEvent.mouseLeave(wrapper);
    act(() => {
      vi.advanceTimersByTime(200); // past HOVER_GRACE_MS
    });
    vi.useRealTimers();
    expect(useUiStore.getState().occluders).toBe(0);
  });
});
