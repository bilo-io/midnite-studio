import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GmAttribution } from './gm-attribution';
import { GmInstrumentPickerView } from './gm-instrument-picker';

const base = { value: { kind: 'program', program: 0 } as const, cached: new Set([0]), downloads: {}, onChange: vi.fn(), onDownload: vi.fn() };

afterEach(cleanup);

describe('GmInstrumentPickerView', () => {
  it('lists all 128 programs in 16 families plus the drum kit', () => {
    render(<GmInstrumentPickerView {...base} />);
    expect(screen.getAllByRole('option')).toHaveLength(129);
    expect(screen.getAllByRole('region')).toHaveLength(16);
    expect(screen.getByText('Drum kit (channel 10)')).toBeTruthy();
  });

  it('badges cached programs and offers a download for the rest', () => {
    const onDownload = vi.fn();
    render(<GmInstrumentPickerView {...base} onDownload={onDownload} />);
    expect(screen.getAllByText('Cached')).toHaveLength(1);
    fireEvent.click(screen.getByLabelText('Download Flute'));
    expect(onDownload).toHaveBeenCalledWith(73);
  });

  it('shows progress while downloading', () => {
    render(<GmInstrumentPickerView {...base} downloads={{ 73: { fraction: 0.4 } }} />);
    expect(screen.getByText('40%')).toBeTruthy();
  });

  it('shows the not-downloaded hint for a missing selection, not for a cached one', () => {
    const { rerender } = render(<GmInstrumentPickerView {...base} />);
    expect(screen.queryByRole('status')).toBeNull();
    rerender(<GmInstrumentPickerView {...base} value={{ kind: 'program', program: 73 }} />);
    expect(screen.getByRole('status').textContent).toContain('Not downloaded');
  });

  it('filters by search and reports selection', () => {
    const onChange = vi.fn();
    render(<GmInstrumentPickerView {...base} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Search instruments'), { target: { value: 'harp' } });
    fireEvent.click(screen.getByRole('option', { name: /Orchestral Harp/ }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'program', program: 46 });
  });
});

describe('GmAttribution', () => {
  it('credits FluidR3_GM and MIDI.js Soundfonts', () => {
    render(<GmAttribution />);
    expect(screen.getByText(/Frank Wen/)).toBeTruthy();
    expect(screen.getByText(/Benjamin Gleitzman/)).toBeTruthy();
  });
});
