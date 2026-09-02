import {
  DEFAULT_LOOP_SCHEDULE,
  DEFAULT_LOOPS,
  type LoopDefinition,
} from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LoopComposer } from './loop-composer';

afterEach(cleanup);

const watchdog = DEFAULT_LOOPS.find((l) => l.id === 'watchdog') as LoopDefinition;
const boxes = watchdog.modifiers.filter((m) => m.control === 'checkbox');
const switches = watchdog.modifiers.filter((m) => m.control === 'switch');

function renderComposer(overrides: Partial<Parameters<typeof LoopComposer>[0]> = {}) {
  const props = {
    loop: watchdog,
    running: false,
    waiting: false,
    thinking: false,
    checked: {} as Record<string, boolean>,
    choiceIds: {} as Record<string, string>,
    model: 'default' as const,
    schedule: DEFAULT_LOOP_SCHEDULE,
    extras: '',
    disabled: false,
    disabledReason: undefined,
    onToggle: vi.fn(),
    onChoice: vi.fn(),
    onModel: vi.fn(),
    onSchedule: vi.fn(),
    onExtras: vi.fn(),
    onStart: vi.fn(),
    onStop: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<LoopComposer {...props} />) };
}

describe('LoopComposer — idle', () => {
  it('draws every declared modifier as the control its own shape says', () => {
    renderComposer();
    for (const modifier of boxes) {
      expect(screen.getByRole('checkbox', { name: modifier.label })).not.toBeNull();
    }
    for (const modifier of switches) {
      expect(screen.getByRole('switch', { name: modifier.label })).not.toBeNull();
    }
    expect(switches.length).toBeGreaterThan(0);
  });

  it('groups the controls under their section headings, in declared order', () => {
    const { container } = renderComposer();
    const sections = [...container.querySelectorAll('[data-loop-group]')].map(
      (node) => node.getAttribute('data-loop-group'),
    );
    expect(sections).toEqual(['tasks', 'scope', 'run']);
  });

  it('draws each choice as a radio group with exactly one option on', () => {
    renderComposer();
    for (const choice of watchdog.choices) {
      const group = screen.getByRole('radiogroup', { name: choice.label });
      const radios = [...group.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
      expect(radios).toHaveLength(choice.options.length);
      expect(radios.filter((radio) => radio.checked)).toHaveLength(1);
    }
  });

  it('sits a choice on its declared default when nothing is stored', () => {
    renderComposer();
    expect((screen.getByRole('radio', { name: 'All open' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: 'Ask me' }) as HTMLInputElement).checked).toBe(true);
  });

  it('reports a toggle by modifier id and its new state, box or switch', () => {
    const { props } = renderComposer();
    fireEvent.click(screen.getByRole('checkbox', { name: boxes[0]!.label }));
    expect(props.onToggle).toHaveBeenCalledWith(boxes[0]!.id, true);

    fireEvent.click(screen.getByRole('switch', { name: switches[0]!.label }));
    expect(props.onToggle).toHaveBeenCalledWith(switches[0]!.id, true);
  });

  it('reports a radio by choice id and option id', () => {
    const { props } = renderComposer();
    fireEvent.click(screen.getByRole('radio', { name: 'Ready only' }));
    expect(props.onChoice).toHaveBeenCalledWith('pr-scope', 'ready');

    fireEvent.click(screen.getByRole('radio', { name: 'Fastest' }));
    expect(props.onChoice).toHaveBeenCalledWith('autonomy', 'fastest');
  });

  it('offers the three models as radios, on Default until asked otherwise', () => {
    const { props } = renderComposer();
    const models = screen.getByRole('radiogroup', { name: 'Model' });
    expect([...models.querySelectorAll('input')].map((input) => input.value)).toEqual([
      'default',
      'sonnet-5',
      'opus-5',
    ]);
    expect((screen.getByRole('radio', { name: 'Default' }) as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByRole('radio', { name: 'Opus 5' }));
    expect(props.onModel).toHaveBeenCalledWith('opus-5');
  });

  it('leaves the schedule off, with its window disabled until it is armed', () => {
    renderComposer();
    expect((screen.getByRole('switch', { name: 'Schedule' }) as HTMLInputElement).checked).toBe(
      false,
    );
    expect((screen.getByLabelText('Run Patrol from') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Run Patrol until') as HTMLInputElement).disabled).toBe(true);
  });

  it('reports the whole schedule on any one of its three edits', () => {
    const { props } = renderComposer({ schedule: { enabled: true, from: '09:00', to: '17:00' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Schedule' }));
    expect(props.onSchedule).toHaveBeenCalledWith({ enabled: false, from: '09:00', to: '17:00' });

    fireEvent.change(screen.getByLabelText('Run Patrol from'), { target: { value: '22:00' } });
    expect(props.onSchedule).toHaveBeenCalledWith({ enabled: true, from: '22:00', to: '17:00' });

    fireEvent.change(screen.getByLabelText('Run Patrol until'), { target: { value: '06:00' } });
    expect(props.onSchedule).toHaveBeenCalledWith({ enabled: true, from: '09:00', to: '06:00' });
  });

  it('warns rather than silently sending nothing when the window is zero-width', () => {
    renderComposer({ schedule: { enabled: true, from: '09:00', to: '09:00' } });
    expect(screen.getByText(/no window is sent/i)).not.toBeNull();
  });

  it('offers Start, not Stop', () => {
    renderComposer();
    expect(screen.getByTestId('loop-start')).not.toBeNull();
    expect(screen.queryByTestId('loop-stop')).toBeNull();
  });

  it('takes extras in a textarea, so Return is a newline and not a launch', () => {
    const { props } = renderComposer();
    const extras = screen.getByPlaceholderText('Extra instructions…');
    expect(extras.tagName).toBe('TEXTAREA');

    fireEvent.change(extras, { target: { value: 'Only touch docs.' } });
    expect(props.onExtras).toHaveBeenCalledWith('Only touch docs.');

    fireEvent.keyDown(extras, { key: 'Enter' });
    expect(props.onStart).not.toHaveBeenCalled();
  });

  it('starts on Mod+Enter from the extras field, and not while Start is disabled', () => {
    const { props } = renderComposer();
    fireEvent.keyDown(screen.getByPlaceholderText('Extra instructions…'), {
      key: 'Enter',
      metaKey: true,
    });
    expect(props.onStart).toHaveBeenCalledOnce();

    cleanup();
    const blocked = renderComposer({ disabled: true, disabledReason: 'Select a repository first.' });
    fireEvent.keyDown(screen.getByPlaceholderText('Extra instructions…'), {
      key: 'Enter',
      ctrlKey: true,
    });
    expect(blocked.props.onStart).not.toHaveBeenCalled();
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
  const checked = { [boxes[0]!.id]: true };

  it('collapses to chips: the composer inputs are gone, the checked labels remain', () => {
    renderComposer({ running: true, checked });
    expect(screen.queryByPlaceholderText('Extra instructions…')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByText(boxes[0]!.label)).not.toBeNull();
  });

  it('says so plainly when a run carries nothing but the defaults', () => {
    renderComposer({ running: true, checked: {} });
    expect(screen.getByText('Running with defaults')).not.toBeNull();
  });

  it('names the non-neutral choices, the model and the window it is running under', () => {
    // Everything that reached the command line, not just the boxes: a run on
    // Opus inside an overnight window is a different run from the default one.
    renderComposer({
      running: true,
      checked: {},
      choiceIds: { 'pr-scope': 'mine', autonomy: 'recommended' },
      model: 'opus-5',
      schedule: { enabled: true, from: '22:00', to: '06:00' },
    });
    expect(screen.getByText('Mine')).not.toBeNull();
    expect(screen.getByText('Recommended')).not.toBeNull();
    expect(screen.getByText('Opus 5')).not.toBeNull();
    expect(screen.getByText('22:00–06:00')).not.toBeNull();
  });

  it('says nothing about a neutral choice, a default model or an unarmed schedule', () => {
    renderComposer({
      running: true,
      checked: {},
      choiceIds: { 'pr-scope': 'all', autonomy: 'ask' },
      model: 'default',
      schedule: { enabled: false, from: '09:00', to: '17:00' },
    });
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
