// vitest/jsdom: the cell's chrome and error states. The WebGL canvas is mocked: jsdom has no GL, and the real
// instanced view is covered by the parse and bond tests plus a screenshot.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScienceCell } from '@midnite/studio-shared';

import { MoleculeCellView } from './molecule-cell';

vi.mock('../molecule/molecule-canvas', () => ({ default: () => <div data-testid="canvas" /> }));

type Mol = Extract<ScienceCell, { kind: 'molecule' }>;
const water: Mol = { kind: 'molecule', id: 'c-aaaaaaaa', name: 'water.xyz', format: 'xyz', text: '3\nw\nO 0 0 0.117\nH 0 0.757 -0.469\nH 0 -0.757 -0.469\n' };
const importStructure = vi.fn();

beforeEach(() => {
  importStructure.mockReset();
  window.midniteStudio = { science: { importStructure } } as unknown as typeof window.midniteStudio;
});
afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

describe('MoleculeCellView', () => {
  it('shows counts and the 3D view for a parsed structure', async () => {
    render(<MoleculeCellView cell={water} onChange={() => undefined} />);
    expect(screen.getByText('3 atoms · 2 bonds · XYZ')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('canvas')).toBeTruthy());
  });

  it('explains an unreadable structure instead of drawing', () => {
    render(<MoleculeCellView cell={{ ...water, text: '5\nbad\nO 0 0 0' }} onChange={() => undefined} />);
    expect(screen.getByRole('alert').textContent).toContain('5 atoms');
    expect(screen.queryByTestId('canvas')).toBeNull();
  });

  it('imports through the bridge and reports the new structure', async () => {
    importStructure.mockResolvedValue({ ok: true, value: { name: 'a.pdb', format: 'pdb', text: 'ATOM' } });
    const onChange = vi.fn();
    render(<MoleculeCellView cell={{ ...water, text: '' }} onChange={onChange} />);
    fireEvent.click(screen.getByText('Import…'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ ...water, name: 'a.pdb', format: 'pdb', text: 'ATOM' }));
  });

  it('keeps the cell and shows the size error when the import is refused', async () => {
    importStructure.mockResolvedValue({ ok: false, kind: 'error', message: 'Larger than 10 MB' });
    const onChange = vi.fn();
    render(<MoleculeCellView cell={water} onChange={onChange} />);
    fireEvent.click(screen.getByText('Replace…'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Larger than 10 MB'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does nothing when the picker is cancelled', async () => {
    importStructure.mockResolvedValue({ ok: true, value: { cancelled: true } });
    const onChange = vi.fn();
    render(<MoleculeCellView cell={water} onChange={onChange} />);
    fireEvent.click(screen.getByText('Replace…'));
    await waitFor(() => expect(importStructure).toHaveBeenCalled());
    expect(onChange).not.toHaveBeenCalled();
  });
});
