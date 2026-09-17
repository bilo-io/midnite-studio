// Layer: vitest/jsdom — DOM text/role/aria-pressed assertions, no canvas involved (plain buttons).
import { KNOWLEDGE_LAYOUT_IDS } from '@midnite/studio-shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { KnowledgeLayoutPills } from './knowledge-layout-pills';

afterEach(cleanup);

describe('KnowledgeLayoutPills', () => {
  it('renders exactly one pill per @midnite/studio-shared KNOWLEDGE_LAYOUT_IDS', () => {
    render(<KnowledgeLayoutPills activeId="force-atlas2" onSelect={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(KNOWLEDGE_LAYOUT_IDS.length);
  });

  it('marks the active layout aria-pressed and the rest not', () => {
    render(<KnowledgeLayoutPills activeId="circlepack" onSelect={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    const pressed = buttons.filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
  });

  it('calls onSelect with the clicked layout id', () => {
    const onSelect = vi.fn();
    render(<KnowledgeLayoutPills activeId="force-atlas2" onSelect={onSelect} />);
    screen.getByRole('button', { name: /hierarchy/i }).click();
    expect(onSelect).toHaveBeenCalledWith('hierarchical');
  });

  it('has an accessible group label', () => {
    render(<KnowledgeLayoutPills activeId="force-atlas2" onSelect={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Knowledge canvas layout' })).not.toBeNull();
  });
});
