import { DEFAULT_LOOPS, type LoopDefinition } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LoopComposer } from './loop-composer';

afterEach(cleanup);

const watchdog = DEFAULT_LOOPS.find((l) => l.id === 'watchdog') as LoopDefinition;

function renderComposer(overrides: Partial<Parameters<typeof LoopComposer>[0]> = {}) {
  const props = {
    loop: watchdog,
    running: false,
    waiting: false,
    thinking: false,
    checked: {} as Record<string, boolean>,
    extras: '',
    disabled: false,
    disabledReason: undefined,
    onToggle: vi.fn(),
    onExtras: vi.fn(),
    onStart: vi.fn(),
    onStop: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<LoopComposer {...props} />) };
}

describe('LoopComposer — idle', () => {
  it('renders a checkbox per declared modifier, plus the extras field', () => {
    renderComposer();
    for (const modifier of watchdog.modifiers) {
      expect(screen.getByLabelText(modifier.label, { exact: false })).not.toBeNull();
    }
    expect(screen.getByPlaceholderText('Extra instructions…')).not.toBeNull();
  });

  it('offers Start, not Stop', () => {
    renderComposer();
    expect(screen.getByTestId('loop-start')).not.toBeNull();
    expect(screen.queryByTestId('loop-stop')).toBeNull();
  });

  it('reports a toggle by modifier id and its new state', () => {
    const { props } = renderComposer();
    const first = watchdog.modifiers[0]!;
    fireEvent.click(screen.getByLabelText(first.label, { exact: false }));
    expect(props.onToggle).toHaveBeenCalledWith(first.id, true);
  });

  it('reports extras as they are typed', () => {
    const { props } = renderComposer();
    fireEvent.change(screen.getByPlaceholderText('Extra instructions…'), {
      target: { value: 'Only touch docs.' },
    });
    expect(props.onExtras).toHaveBeenCalledWith('Only touch docs.');
  });

  it('disables Start with a reason when there is nowhere to run', () => {
    renderComposer({ disabled: true, disabledReason: 'Select a repository first.' });
    const start = screen.getByTestId('loop-start') as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    expect(start.title).toBe('Select a repository first.');
  });

  it('wears no glow while idle', () => {
    renderComposer();
    expect(screen.getByTestId('loop-start').className).not.toContain('loop-run-glow');
  });
});

describe('LoopComposer — running', () => {
  const checked = { [watchdog.modifiers[0]!.id]: true };

  it('collapses to chips: the composer inputs are gone, the checked labels remain', () => {
    renderComposer({ running: true, checked });
    expect(screen.queryByPlaceholderText('Extra instructions…')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByText(watchdog.modifiers[0]!.label)).not.toBeNull();
  });

  it('says so plainly when a run carries no modifiers', () => {
    renderComposer({ running: true, checked: {} });
    expect(screen.getByText('Running with defaults')).not.toBeNull();
  });

  it('swaps Start for Stop and reports the press', () => {
    const { props } = renderComposer({ running: true, checked });
    expect(screen.queryByTestId('loop-start')).toBeNull();
    fireEvent.click(screen.getByTestId('loop-stop'));
    expect(props.onStop).toHaveBeenCalledOnce();
  });

  it('wears the steady ring while live but idle — motion means working', () => {
    renderComposer({ running: true, checked });
    const stop = screen.getByTestId('loop-stop');
    expect(stop.className).toContain('loop-run-glow');
    expect(stop.className).not.toContain('is-thinking');
    expect(stop.className).not.toContain('is-waiting');
  });

  it('breathes while the agent is thinking', () => {
    renderComposer({ running: true, thinking: true, checked });
    expect(screen.getByTestId('loop-stop').className).toContain('is-thinking');
  });

  it('goes steady amber while waiting on the user, outranking thinking', () => {
    renderComposer({ running: true, waiting: true, thinking: true, checked });
    const stop = screen.getByTestId('loop-stop');
    expect(stop.className).toContain('is-waiting');
    expect(stop.className).not.toContain('is-thinking');
  });
});
