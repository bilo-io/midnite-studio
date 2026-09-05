import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CircularGauge } from './circular-gauge';

describe('CircularGauge', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the percentage in its accessible label', () => {
    render(<CircularGauge percent={42} label="GPU load" />);
    expect(screen.getByRole('img', { name: 'GPU load: 42%' })).toBeDefined();
  });

  it('clamps a percent above 100 to the bound rather than overflowing the ring', () => {
    render(<CircularGauge percent={150} label="Overfull" />);
    expect(screen.getByRole('img', { name: 'Overfull: 100%' })).toBeDefined();
  });

  it('clamps a percent below 0 to the bound', () => {
    render(<CircularGauge percent={-20} label="Negative" />);
    expect(screen.getByRole('img', { name: 'Negative: 0%' })).toBeDefined();
  });

  it('renders detail text when given', () => {
    render(<CircularGauge percent={10} label="Memory" detail="1.2 / 16 GB" />);
    expect(screen.getByText('1.2 / 16 GB')).toBeDefined();
  });
});
