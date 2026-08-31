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

  it('renders diff totals in a bold container aligned across the header', () => {
    const { container } = render(<ChangeTotals fileCount={2} insertions={10} deletions={5} />);
    const totals = container.querySelector('[data-testid="change-totals"]');
    expect(totals?.className).toContain('justify-between');
    const boldWrapper = container.querySelector('.font-bold');
    expect(boldWrapper).not.toBeNull();
    expect(boldWrapper?.textContent).toContain('+10');
    expect(boldWrapper?.textContent).toContain('−5');
  });

  it('shrinks and truncates instead of forcing its row to overflow', () => {
    const { container } = render(
      <ChangeTotals fileCount={145_000} insertions={12_345_678} deletions={9_876_543} />,
    );
    const totals = container.querySelector('[data-testid="change-totals"]');
    expect(totals?.className).toContain('min-w-0');
    expect(totals?.className).toContain('flex-1');
    expect(totals?.className).not.toContain('w-full');
    const fileCountLabel = screen.getByText('145,000 files');
    expect(fileCountLabel.className).toContain('truncate');
  });
});
