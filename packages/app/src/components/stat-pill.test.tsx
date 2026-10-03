import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatPill } from './stat-pill';

describe('StatPill', () => {
  it('renders its figure in an accent-tinted tabular pill', () => {
    render(<StatPill>1st</StatPill>);
    const el = screen.getByText('1st');
    expect(el.className).toContain('bg-primary/15');
    expect(el.className).toContain('text-primary');
    expect(el.className).toContain('tabular-nums');
  });
});
