import { BUILTIN_AGENTS } from '@midnite/studio-shared';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AgentAvatar } from './agent-avatar';

afterEach(cleanup);

const claude = BUILTIN_AGENTS.find((agent) => agent.id === 'claude')!;

function cssColor(value: string): string {
  const probe = document.createElement('span');
  probe.style.color = value;
  return probe.style.color;
}

describe('AgentAvatar', () => {
  it("a working agent: its mark in the brand colour, inside the brand-coloured arc", () => {
    const { container } = render(<AgentAvatar agent={claude} live activityStatus="agent" />);
    const ring = container.querySelector('[data-testid="session-icon-glow"]') as HTMLElement;
    expect(ring.classList.contains('activity-glow')).toBe(true);
    expect(ring.classList.contains('terminal-agent-glow')).toBe(true);
    expect(ring.getAttribute('data-agent-icon')).toBe('true');
    expect(ring.style.getPropertyValue('--agent-accent')).toBe(claude.accent);
    const mark = container.querySelector('[data-agent-avatar="claude"] svg') as SVGElement;
    expect(mark.style.color).toBe(cssColor(claude.accent));
  });

  it('idle: the mark alone, no ring', () => {
    const { container } = render(<AgentAvatar agent={claude} live activityStatus="idle" />);
    expect(container.querySelector('[data-testid="session-icon-glow"]')).toBeNull();
    expect(container.querySelector('[data-agent-avatar="claude"]')).not.toBeNull();
  });

  it('a shell: the terminal glyph and the shell ring, never the agent arc', () => {
    const { container } = render(<AgentAvatar agent={undefined} live activityStatus="shell" />);
    const ring = container.querySelector('[data-testid="session-icon-glow"]') as HTMLElement;
    expect(ring.getAttribute('data-activity-status')).toBe('shell');
    expect(ring.classList.contains('terminal-agent-glow')).toBe(false);
    expect(container.querySelector('[data-agent-avatar="shell"]')).not.toBeNull();
  });

  it('an agent the roster does not know: its arc falls back to the default agent colour', () => {
    const { container } = render(<AgentAvatar agent={{ id: 'mystery' }} live activityStatus="agent" />);
    const ring = container.querySelector('[data-testid="session-icon-glow"]') as HTMLElement;
    expect(ring.style.getPropertyValue('--agent-accent')).toBe('var(--activity-agent)');
  });

  it('not live: the mark dims', () => {
    const { container } = render(<AgentAvatar agent={claude} live={false} activityStatus="idle" />);
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('opacity-50');
  });
});
