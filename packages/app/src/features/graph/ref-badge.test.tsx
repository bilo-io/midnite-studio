import type { Ref } from '@midnite/studio-shared';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { graphThemeFor } from './graph-themes';
import { RefBadge } from './ref-badge';

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

  it('renders RefBadge with agent gradient glow when agentActive is true', () => {
    const ref = makeRef('feature/active-agent');
    const { container } = render(
      <RefBadge
        refItem={ref}
        colorIdx={3}
        palette={theme.palette}
        agentActive={true}
      />,
    );

    const badge = container.querySelector('[data-ref="refs/heads/feature/active-agent"]');
    expect(badge).toBeDefined();
    expect((badge as HTMLElement).style.boxShadow).toContain('hsl(var(--lane-h) var(--lane-s) var(--lane-l)');
    expect((badge as HTMLElement).style.boxShadow).toContain('14px');
  });

  it('renders HeadGlow sweep animation when agentActive is true even if not head', () => {
    const ref = makeRef('feature/active-agent');
    const { container } = render(
      <RefBadge
        refItem={ref}
        colorIdx={3}
        palette={theme.palette}
        agentActive={true}
      />,
    );

    const sweep = container.querySelector('.animate-lane-sweep');
    expect(sweep).not.toBeNull();
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
