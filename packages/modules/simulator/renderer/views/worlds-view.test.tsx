// vitest/jsdom: the Virtual worlds side panel and its read-outs; the WebGL scene is stubbed (jsdom has no GL).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FrameChromeProvider } from '@midnite/studio-frame';

import { SIMULATOR_CHROME } from '../compose/simulator-chrome';
import { sig4, WorldsView } from './worlds-view';

vi.mock('./nbody-scene', () => ({ NBodyScene: () => null }));

afterEach(cleanup);

const mount = () =>
  render(
    <FrameChromeProvider chrome={SIMULATOR_CHROME}>
      <WorldsView />
    </FrameChromeProvider>,
  );

describe('WorldsView', () => {
  it('lists the preset bodies and switches presets', () => {
    mount();
    expect(screen.getAllByRole('row')).toHaveLength(1 + 3);
    fireEvent.change(screen.getByLabelText('Preset'), { target: { value: 'inner-solar' } });
    expect(screen.getAllByRole('row')).toHaveLength(1 + 5);
  });

  it('removes and adds a body', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Moon' }));
    expect(screen.getAllByRole('row')).toHaveLength(1 + 2);
    fireEvent.click(screen.getByRole('button', { name: 'Add body' }));
    expect(screen.getAllByRole('row')).toHaveLength(1 + 3);
  });

  it('refuses a dt of zero or less and keeps the old value', () => {
    mount();
    const dt = screen.getByLabelText('dt') as HTMLInputElement;
    fireEvent.change(dt, { target: { value: '0' } });
    expect(dt.getAttribute('aria-invalid')).toBe('true');
    fireEvent.blur(dt);
    expect(dt.value).toBe('0.5');
    fireEvent.change(dt, { target: { value: '0.25' } });
    fireEvent.blur(dt);
    expect(dt.value).toBe('0.25');
  });

  it('shows the energy read-outs as a dash until the first stats', () => {
    mount();
    expect(screen.getByTestId('energy-drift').textContent).toBe('—');
  });
});

describe('sig4', () => {
  it('formats four significant figures', () => {
    expect(sig4(1.23456e-7)).toBe('1.235e-7');
    expect(sig4(0)).toBe('0');
    expect(sig4(undefined)).toBe('—');
  });
});
