// Layer: vitest/jsdom — DOM roles/text over a pure pill row, no canvas.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { KnowledgeDetailPills } from './knowledge-detail-pills';

describe('KnowledgeDetailPills', () => {
  afterEach(cleanup);

  it('renders nothing for a graph that fits the smallest budget', () => {
    const { container } = render(<KnowledgeDetailPills nodeCount={900} activeId="core" onSelect={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('offers one pill per distinguishable level, each carrying the count it mounts', () => {
    render(<KnowledgeDetailPills nodeCount={15_292} activeId="core" onSelect={vi.fn()} />);
    const group = screen.getByRole('group', { name: 'Knowledge canvas detail' });
    const pills = group.querySelectorAll('button[aria-pressed]');
    expect([...pills].map((b) => b.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Core · 1.5k',
      'Extended · 5k',
      'Everything · 15.3k',
    ]);
    expect(screen.getByRole('button', { name: /^Core/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /^Everything/ }).getAttribute('aria-pressed')).toBe('false');
  });

  it('a mid-sized graph stops at the first level that fits everything', () => {
    render(<KnowledgeDetailPills nodeCount={3_000} activeId="extended" onSelect={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /^Extended/ }).textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Extended · 3k',
    );
  });

  it('clicking a pill reports its id', () => {
    const onSelect = vi.fn();
    render(<KnowledgeDetailPills nodeCount={15_292} activeId="core" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /^Everything/ }));
    expect(onSelect).toHaveBeenCalledWith('all');
  });
});
