// Layer: vitest/jsdom — DOM text/role/aria-pressed assertions, no canvas
// involved (the pills are plain buttons; sigma is behind a separate,
// un-unit-testable-under-jsdom seam).
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { KnowledgeVariantPills } from './knowledge-variant-pills';

afterEach(cleanup);

describe('KnowledgeVariantPills', () => {
  it('renders one pill per registered variant — one in Theme A: sigma', () => {
    render(<KnowledgeVariantPills activeId="sigma" onSelect={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: /sigma/i })).toHaveLength(1);
  });

  it('marks the active variant aria-pressed and the rest not', () => {
    render(<KnowledgeVariantPills activeId="sigma" onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: /sigma/i }).getAttribute('aria-pressed')).toBe('true');
  });

  it('calls onSelect with the clicked variant id', () => {
    const onSelect = vi.fn();
    render(<KnowledgeVariantPills activeId="sigma" onSelect={onSelect} />);
    screen.getByRole('button', { name: /sigma/i }).click();
    expect(onSelect).toHaveBeenCalledWith('sigma');
  });
});
