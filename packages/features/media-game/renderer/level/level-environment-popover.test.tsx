import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LevelEnvironmentPopover } from './level-environment-popover';

afterEach(cleanup);

const prop = (name: string, value: unknown) => ({ name, value });
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Environment' }));

describe('LevelEnvironmentPopover', () => {
  it('lists auto plus the level weatherOptions and reports a pick', () => {
    const onWeather = vi.fn();
    render(<LevelEnvironmentPopover level={{ properties: [prop('midnite.weatherOptions', 'clear,rain')] }} readOnly={false} onWeather={onWeather} onTimeOfDay={vi.fn()} onTimeScale={vi.fn()} />);
    open();
    const select = screen.getByLabelText('Weather') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['auto', 'clear', 'rain']);
    fireEvent.change(select, { target: { value: 'rain' } });
    expect(onWeather).toHaveBeenCalledWith('rain');
  });

  it('falls back to free text without weatherOptions, and shows the game-default placeholder for the clock', () => {
    const onTimeOfDay = vi.fn();
    render(<LevelEnvironmentPopover level={{}} readOnly={false} onWeather={vi.fn()} onTimeOfDay={onTimeOfDay} onTimeScale={vi.fn()} />);
    open();
    expect((screen.getByLabelText('Weather') as HTMLElement).tagName).toBe('INPUT');
    const clock = screen.getByLabelText('Time of day (h)') as HTMLInputElement;
    expect(clock.placeholder).toBe('game default');
    fireEvent.change(clock, { target: { value: '18.5' } });
    fireEvent.blur(clock);
    expect(onTimeOfDay).toHaveBeenCalledWith('18.5');
  });

  it('shows the stored values and disables the fields read-only', () => {
    render(<LevelEnvironmentPopover level={{ properties: [prop('midnite.timeOfDay', 6), prop('midnite.timeScale', 2)] }} readOnly onWeather={vi.fn()} onTimeOfDay={vi.fn()} onTimeScale={vi.fn()} />);
    open();
    expect((screen.getByLabelText('Time of day (h)') as HTMLInputElement).value).toBe('6');
    expect((screen.getByLabelText('Time scale') as HTMLInputElement).value).toBe('2');
    expect((screen.getByLabelText('Time scale') as HTMLInputElement).disabled).toBe(true);
  });
});
