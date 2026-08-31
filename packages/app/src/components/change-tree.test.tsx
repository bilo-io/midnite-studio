import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChangeTotals, Counts } from './change-tree';

describe('Counts', () => {
  it('formats counts with comma separators when >= 1000', () => {
    render(<Counts insertions={1250} deletions={3400} />);
    expect(screen.getByText('+1,250')).not.toBeNull();
    expect(screen.getByText('−3,400')).not.toBeNull();
  });

  it('formats small counts without separators', () => {
    render(<Counts insertions={15} deletions={3} />);
    expect(screen.getByText('+15')).not.toBeNull();
    expect(screen.getByText('−3')).not.toBeNull();
  });
});

describe('ChangeTotals', () => {
  it('formats file counts and line diffs with comma separators', () => {
    render(<ChangeTotals fileCount={1450} insertions={12000} deletions={4500} />);
    expect(screen.getByText('1,450 files')).not.toBeNull();
    expect(screen.getByText('+12,000')).not.toBeNull();
    expect(screen.getByText('−4,500')).not.toBeNull();
  });
});
