import {
  BUILTIN_AGENTS,
  DEFAULT_LOOP_SCHEDULE,
  DEFAULT_LOOPS,
  LOOP_FREQUENCIES,
  LOOP_MODELS,
  type LoopDefinition,
} from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LoopComposer } from './loop-composer';

afterEach(cleanup);

const watchdog = DEFAULT_LOOPS.find((l) => l.id === 'watchdog') as LoopDefinition;
const boxes = watchdog.modifiers.filter((m) => m.control === 'checkbox');
const switches = watchdog.modifiers.filter((m) => m.control === 'switch');

/**
 * A `react-select`'s own input, by accessible name.
 *
 * `getByRole('combobox')` rather than `getByLabelText`: `ComposerSection`
 * gives its `<Collapse>` body an `aria-label` of the section title, so a
 * label query for "Model" matches both that wrapper and the select inside it.
 */
function combobox(name: string): HTMLElement {
  return screen.getByRole('combobox', { name });
}

/**
 * Open a `react-select` and click one of its rows.
 *
 * `mouseDown` rather than `click` on the control — that is the event
 * `react-select` opens its menu on — and the row is addressed by its `option`
 * role, not its text: the day picker keeps selected rows in the menu
 * (`hideSelectedOptions={false}`), so "Sat" appears as both a chip and an
 * option and `getByText` would be ambiguous.
 */
function pickInSelect(name: string, option: string): void {
  fireEvent.mouseDown(combobox(name));
  fireEvent.click(screen.getByRole('option', { name: option }));
}

function renderComposer(overrides: Partial<Parameters<typeof LoopComposer>[0]> = {}) {
  const props = {
    loop: watchdog,
    running: false,
    waiting: false,
    thinking: false,
    checked: {} as Record<string, boolean>,
    choiceIds: {} as Record<string, string>,
    agents: BUILTIN_AGENTS,
    agentId: 'claude',
    model: 'default' as const,
    schedule: DEFAULT_LOOP_SCHEDULE,
    extras: '',
    disabled: false,
    disabledReason: undefined,
    onToggle: vi.fn(),
    onChoice: vi.fn(),
    onAgent: vi.fn(),
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

  it('offers the provider and its models as two selects, Claude on Default', () => {
    const { props } = renderComposer();
    expect(combobox('Provider')).not.toBeNull();
    expect(combobox('Model')).not.toBeNull();

    // Every registered model, since the provider is Claude.
    fireEvent.mouseDown(combobox('Model'));
    expect(screen.getAllByRole('option').map((row) => row.textContent)).toEqual(
      LOOP_MODELS.map((entry) => entry.label),
    );

    pickInSelect('Model', 'Opus 5');
    expect(props.onModel).toHaveBeenCalledWith('opus-5');
  });

  it('reports a provider by roster id, and offers every roster agent', () => {
    const { props } = renderComposer();
    fireEvent.mouseDown(combobox('Provider'));
    expect(screen.getAllByRole('option')).toHaveLength(BUILTIN_AGENTS.length);

    pickInSelect('Provider', 'Codex');
    expect(props.onAgent).toHaveBeenCalledWith('codex');
  });

  it('collapses the model select to Default for a provider that takes no --model', () => {
    // `loopModelArgs` passes `--model` to `claude` alone; a picker that
    // offered Opus for Codex would claim a flag the launcher drops.
    const { container } = renderComposer({ agentId: 'codex', model: 'opus-5' });
    const section = container.querySelector('[data-loop-section="model"]') as HTMLElement;

    // A disabled `react-select` hides its own input from the a11y tree, so the
    // control is unreachable rather than merely styled as off.
    expect(within(section).queryByRole('combobox', { name: 'Model' })).toBeNull();
    const input = section.querySelector('input[aria-label="Model"]') as HTMLInputElement;
    expect(input.disabled).toBe(true);

    // The stored Claude model is kept, not cleared — switch back and it is
    // still there — but what a Codex run carries is shown, which is nothing.
    expect(within(section).getByText('Default')).not.toBeNull();
    expect(within(section).queryByText('Opus 5')).toBeNull();
    expect(within(section).getByRole('combobox', { name: 'Provider' })).not.toBeNull();
  });

  it('names provider and model on the heading, and drops a neutral model', () => {
    const { unmount } = renderComposer({ agentId: 'codex', model: 'default' });
    expect(screen.getByRole('button', { name: /^Model/ }).textContent).toContain('Codex');
    expect(screen.getByRole('button', { name: /^Model/ }).textContent).not.toContain('Default');
    unmount();

    renderComposer({ agentId: 'claude', model: 'opus-5' });
    expect(screen.getByRole('button', { name: /^Model/ }).textContent).toContain('Claude · Opus 5');
  });

  it('leaves the schedule off, with its window disabled until it is armed', () => {
    renderComposer();
    expect((screen.getByRole('switch', { name: 'Window' }) as HTMLInputElement).checked).toBe(
      false,
    );
    expect((screen.getByLabelText('Run Patrol from') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Run Patrol until') as HTMLInputElement).disabled).toBe(true);
  });

  it('reports the whole schedule on any one of its edits', () => {
    const { props } = renderComposer({ schedule: { enabled: true, from: '09:00', to: '17:00' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Window' }));
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

  it('offers the cadence as a select, on the neutral option until picked', () => {
    const { props } = renderComposer();
    fireEvent.mouseDown(combobox('Every'));
    expect(screen.getAllByRole('option').map((row) => row.textContent)).toEqual(
      LOOP_FREQUENCIES.map((entry) => entry.label),
    );

    pickInSelect('Every', 'Hourly');
    expect(props.onSchedule).toHaveBeenCalledWith({
      ...DEFAULT_LOOP_SCHEDULE,
      frequency: 'hourly',
    });
  });

  it('offers all seven days as a multi-select, every one of them on by default', () => {
    const { props } = renderComposer();
    fireEvent.mouseDown(combobox('Days'));
    expect(screen.getAllByRole('option').map((row) => row.textContent)).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ]);

    // Clicking a selected row in a multi-select removes it — the neutral
    // "every day" answer becomes a restriction with one gesture.
    fireEvent.click(screen.getByRole('option', { name: 'Sat' }));
    expect(props.onSchedule).toHaveBeenCalledWith({
      ...DEFAULT_LOOP_SCHEDULE,
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sun'],
    });
  });

  it('reads a schedule stored as a legacy preset token as the day set it named', () => {
    // Nothing re-parses `settings.json` through zod on the way in, so the
    // string is still what reaches this component.
    renderComposer({
      schedule: { ...DEFAULT_LOOP_SCHEDULE, days: 'weekends' as unknown as never },
    });
    fireEvent.mouseDown(combobox('Days'));
    expect(screen.getByRole('option', { name: 'Sat' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('option', { name: 'Mon' }).getAttribute('aria-selected')).toBe('false');
  });

  it('warns rather than silently sending nothing when no day is picked', () => {
    renderComposer({ schedule: { ...DEFAULT_LOOP_SCHEDULE, days: [] } });
    expect(screen.getByText(/no day restriction is sent/i)).not.toBeNull();
  });

  it('leaves cadence and days live while the window switch is off', () => {
    // They are answers you set once; greying them out with the switch would
    // mean re-answering them every time a loop is re-armed.
    renderComposer({ schedule: { ...DEFAULT_LOOP_SCHEDULE, enabled: false } });
    expect((combobox('Every') as HTMLInputElement).disabled).toBe(false);
    expect((combobox('Days') as HTMLInputElement).disabled).toBe(false);
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

  it('sits Start under the extras field, full width, wearing the gradient border', () => {
    renderComposer();
    const start = screen.getByTestId('loop-start');
    expect(start.className).toContain('w-full');
    expect(start.className).toContain('loop-start-gradient');
    // `border-border` would paint an opaque line over the gradient the
    // two-layer `background-clip` in `.loop-start-gradient` exists to show.
    expect(start.className).not.toContain('border-border');

    const extras = screen.getByPlaceholderText('Extra instructions…');
    expect(extras.parentElement).toBe(start.parentElement);
    expect(extras.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps Stop inline in the running strip rather than full width', () => {
    renderComposer({ running: true });
    const stop = screen.getByTestId('loop-stop');
    expect(stop.className).not.toContain('w-full');
    expect(stop.className).not.toContain('loop-start-gradient');
  });
});

describe('LoopComposer — accordions', () => {
  it('opens every section, so nothing a loop declares starts out of sight', () => {
    renderComposer();
    for (const title of ['Tasks', 'Scope', 'Run', 'Model', 'Schedule']) {
      expect(
        screen.getByRole('button', { name: new RegExp(`^${title}`) }).getAttribute('aria-expanded'),
        title,
      ).toBe('true');
    }
  });

  it('shuts and reopens one section without touching its neighbours', () => {
    renderComposer();
    const tasks = screen.getByRole('button', { name: /^Tasks/ });
    fireEvent.click(tasks);
    expect(tasks.getAttribute('aria-expanded')).toBe('false');
    expect(
      screen.getByRole('button', { name: /^Scope/ }).getAttribute('aria-expanded'),
    ).toBe('true');

    fireEvent.click(tasks);
    expect(tasks.getAttribute('aria-expanded')).toBe('true');
  });

  it('gives every heading a glyph of its own, chevron aside', () => {
    // Five identical rows of small uppercase text is what this was; the icon
    // is what makes "where do I set the model" answerable at a glance.
    const { container } = renderComposer();
    for (const id of ['tasks', 'scope', 'run', 'model', 'schedule']) {
      const heading = container.querySelector(`[data-loop-section="${id}"] > button`);
      expect(heading?.querySelectorAll('svg').length, id).toBe(2);
    }
  });

  it('points each heading at the body it controls', () => {
    renderComposer();
    const heading = screen.getByRole('button', { name: /^Schedule/ });
    const bodyId = heading.getAttribute('aria-controls');
    expect(bodyId).toBeTruthy();
    // `useId` produces ids like `:r3:`, which no CSS selector will parse.
    expect(document.getElementById(bodyId!)).not.toBeNull();
  });

  it('says on a shut heading how many of its controls are on', () => {
    // A collapsed section that reported nothing would be the one way this
    // layout could lose information the flat list always showed.
    renderComposer({ checked: { [boxes[0]!.id]: true, [boxes[1]!.id]: true } });
    expect(screen.getByRole('button', { name: /^Tasks/ }).textContent).toContain('2 on');
  });

  it('names the current model and schedule on their own headings', () => {
    renderComposer({
      model: 'opus-4-8',
      schedule: { enabled: true, from: '22:00', to: '06:00', days: ['sat', 'sun'] },
    });
    expect(screen.getByRole('button', { name: /^Model/ }).textContent).toContain('Opus 4.8');
    const schedule = screen.getByRole('button', { name: /^Schedule/ }).textContent;
    expect(schedule).toContain('22:00–06:00');
    expect(schedule).toContain('Weekends');
  });

  it('says Off on the schedule heading when nothing is armed', () => {
    renderComposer();
    expect(screen.getByRole('button', { name: /^Schedule/ }).textContent).toContain('Off');
  });

  it('lays the checkboxes out as a grid, not a to-do list', () => {
    // Any subset of these is a valid run — a column of them read as steps.
    const { container } = renderComposer();
    const grid = container.querySelector('[data-loop-group="tasks"] .grid-cols-2');
    expect(grid).not.toBeNull();
    expect(grid!.querySelectorAll('input[type="checkbox"]')).toHaveLength(boxes.length);
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
