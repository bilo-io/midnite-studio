import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LevelEnvironmentPopover } from './level-environment-popover';

afterEach(cleanup);

const prop = (name: string, value: unknown) => ({ name, value });
const noop = { onProps: vi.fn(), onStroke: vi.fn(), onReset: vi.fn() };
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Environment' }));

describe('LevelEnvironmentPopover', () => {
  it('lists auto plus the level weatherOptions and reports a pick', () => {
    const onWeather = vi.fn();
    render(<LevelEnvironmentPopover level={{ properties: [prop('midnite.weatherOptions', 'clear,rain')] }} readOnly={false} onWeather={onWeather} onTimeOfDay={vi.fn()} onTimeScale={vi.fn()} {...noop} />);
    open();
    const select = screen.getByLabelText('Weather') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['auto', 'clear', 'rain']);
    fireEvent.change(select, { target: { value: 'rain' } });
    expect(onWeather).toHaveBeenCalledWith('rain');
  });

  it('falls back to free text without weatherOptions, and shows the game-default placeholder for the clock', () => {
    const onTimeOfDay = vi.fn();
    render(<LevelEnvironmentPopover level={{}} readOnly={false} onWeather={vi.fn()} onTimeOfDay={onTimeOfDay} onTimeScale={vi.fn()} {...noop} />);
    open();
    expect((screen.getByLabelText('Weather') as HTMLElement).tagName).toBe('INPUT');
    const clock = screen.getByLabelText('Time of day (h)') as HTMLInputElement;
    expect(clock.placeholder).toBe('game default');
    fireEvent.change(clock, { target: { value: '18.5' } });
    fireEvent.blur(clock);
    expect(onTimeOfDay).toHaveBeenCalledWith('18.5');
  });

  it('shows the stored values and disables the fields read-only', () => {
    render(<LevelEnvironmentPopover level={{ properties: [prop('midnite.timeOfDay', 6), prop('midnite.timeScale', 2)] }} readOnly onWeather={vi.fn()} onTimeOfDay={vi.fn()} onTimeScale={vi.fn()} {...noop} />);
    open();
    expect((screen.getByLabelText('Time of day (h)') as HTMLInputElement).value).toBe('6');
    expect((screen.getByLabelText('Time scale') as HTMLInputElement).value).toBe('2');
    expect((screen.getByLabelText('Time scale') as HTMLInputElement).disabled).toBe(true);
  });

  it('B2: "From time of day" is on without sun props and clears them when switched on', () => {
    const onProps = vi.fn();
    render(<LevelEnvironmentPopover level={{ properties: [prop('midnite.sunAzimuth', 90), prop('midnite.sunElevation', 20)] }} readOnly={false} onWeather={vi.fn()} onTimeOfDay={vi.fn()} onTimeScale={vi.fn()} {...noop} onProps={onProps} />);
    open();
    const sw = screen.getByRole('switch', { name: /From time of day/ });
    fireEvent.click(sw);
    expect(onProps).toHaveBeenCalledWith({ 'midnite.sunAzimuth': null, 'midnite.sunElevation': null });
  });

  it('picks a sky and a post preset, and Game default removes them', () => {
    const onProps = vi.fn();
    render(<LevelEnvironmentPopover level={{ properties: [prop('midnite.sky', 'dusk')] }} readOnly={false} onWeather={vi.fn()} onTimeOfDay={vi.fn()} onTimeScale={vi.fn()} {...noop} onProps={onProps} />);
    open();
    fireEvent.click(screen.getByRole('radio', { name: 'night' }));
    expect(onProps).toHaveBeenCalledWith({ 'midnite.sky': 'night' });
    fireEvent.click(screen.getByRole('radio', { name: 'vivid' }));
    expect(onProps).toHaveBeenCalledWith({ 'midnite.post': 'vivid' });
  });

  it('B3: Reset is disabled on an untouched level and calls onReset otherwise', () => {
    const onReset = vi.fn();
    const { rerender } = render(<LevelEnvironmentPopover level={{}} readOnly={false} onWeather={vi.fn()} onTimeOfDay={vi.fn()} onTimeScale={vi.fn()} {...noop} onReset={onReset} />);
    open();
    expect((screen.getByRole('button', { name: 'Reset to game default' }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<LevelEnvironmentPopover level={{ properties: [prop('midnite.post', 'soft')] }} readOnly={false} onWeather={vi.fn()} onTimeOfDay={vi.fn()} onTimeScale={vi.fn()} {...noop} onReset={onReset} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset to game default' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('a slider press opens a stroke and the release closes it', () => {
    const onStroke = vi.fn();
    render(<LevelEnvironmentPopover level={{}} readOnly={false} onWeather={vi.fn()} onTimeOfDay={vi.fn()} onTimeScale={vi.fn()} {...noop} onStroke={onStroke} />);
    open();
    const slider = screen.getByLabelText('Time of day slider');
    fireEvent.pointerDown(slider);
    expect(onStroke).toHaveBeenLastCalledWith(true);
    fireEvent.pointerUp(window);
    expect(onStroke).toHaveBeenLastCalledWith(false);
    expect(onStroke).toHaveBeenCalledTimes(2);
  });
});
