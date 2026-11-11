import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ComputeResult } from './compute-cell';

afterEach(cleanup);

describe('ComputeResult', () => {
  it('shows the KaTeX and the value of a good result', () => {
    const { container } = render(<ComputeResult result={{ ok: true, text: '9', tex: 'a ^{2}' }} pending={false} />);
    expect(container.querySelector('.katex')).not.toBeNull();
    expect(screen.getByText('9')).toBeTruthy();
  });
  it('shows Line N: message for a failure', () => {
    render(<ComputeResult result={{ ok: false, line: 2, message: 'Undefined symbol y' }} pending={false} />);
    expect(screen.getByRole('alert').textContent).toBe('Line 2: Undefined symbol y');
  });
  it('shows Computing only while pending and without a result', () => {
    const { rerender } = render(<ComputeResult result={undefined} pending={false} />);
    expect(screen.queryByText('Computing…')).toBeNull();
    rerender(<ComputeResult result={undefined} pending />);
    expect(screen.getByText('Computing…')).toBeTruthy();
  });
});
