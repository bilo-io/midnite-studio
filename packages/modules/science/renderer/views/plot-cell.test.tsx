// vitest/jsdom: a controlled form; no layout needed.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PlotCell } from '../plot/sample';
import { PlotCellView } from './plot-cell';

afterEach(cleanup);

const cell: PlotCell = { kind: 'plot', id: 'c-aaaaaaaa', series: [{ expr: 'sin(x)' }], x: { min: 0, max: 6 }, y: 'auto' };

describe('PlotCellView', () => {
  it('adds a series up to four and removes one', () => {
    const onChange = vi.fn();
    render(<PlotCellView cell={cell} samples={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByText('Add series'));
    expect(onChange.mock.calls[0]![0].series).toHaveLength(2);
  });
  it('disables Add series at four series and Remove at one', () => {
    const four: PlotCell = { ...cell, series: [{ expr: 'x' }, { expr: 'x' }, { expr: 'x' }, { expr: 'x' }] };
    render(<PlotCellView cell={four} samples={undefined} onChange={() => undefined} />);
    expect((screen.getByText('Add series').closest('button') as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    render(<PlotCellView cell={cell} samples={undefined} onChange={() => undefined} />);
    expect((screen.getByLabelText('Remove series 1') as HTMLButtonElement).disabled).toBe(true);
  });
  it('ignores an x range whose max is not above its min', () => {
    const onChange = vi.fn();
    render(<PlotCellView cell={cell} samples={undefined} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('x max'), { target: { value: '-1' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('x max'), { target: { value: '9' } });
    expect(onChange.mock.calls[0]![0].x).toEqual({ min: 0, max: 9 });
  });
  it('switches the y range off auto', () => {
    const onChange = vi.fn();
    render(<PlotCellView cell={cell} samples={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Auto y range'));
    expect(onChange.mock.calls[0]![0].y).toEqual({ min: -1, max: 1 });
  });
});
