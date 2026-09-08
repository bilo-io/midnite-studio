import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCompanionStore } from '../../store/companion-store';
import { useUiStore } from '../../store/ui-store';
import { CompanionPanel, CompanionPanelSlot } from './companion-panel';
import { companionPorts, resetCompanionPorts, setCompanionPorts } from './companion-ports';
import { renderPanel } from './render-panel';

/**
 * The thread is virtualised, and jsdom gives every element a zero-sized box
 * and no `ResizeObserver` — so without these two stubs the virtualizer
 * correctly concludes there is no viewport and renders none of the turns,
 * which looks exactly like the panel being broken.
 *
 * Local to this file rather than added to `vitest-setup.ts`: a global
 * `ResizeObserver` and a global non-zero `clientHeight` would silently change
 * what every other component test in this package measures.
 */
beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    class StubResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: StubResizeObserver,
    });
  }
  /*
    `offsetHeight`/`offsetWidth` as well as the `client*` pair, because
    `@tanstack/react-virtual`'s `observeElementRect` seeds its first viewport
    measurement from the OFFSET box and only then hands over to the
    `ResizeObserver` — which the stub above never fires. With only
    `clientHeight` stubbed the virtualizer computes the right total size and
    then renders zero rows, which is a convincing-looking wrong answer.
  */
  for (const prop of ['clientHeight', 'offsetHeight'] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => 600 });
  }
  for (const prop of ['clientWidth', 'offsetWidth'] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => 360 });
  }
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({
      width: 360,
      height: 600,
      top: 0,
      left: 0,
      right: 360,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
});

beforeEach(() => {
  useUiStore.setState({ companionEnabled: true, companionPanelOpen: true });
  useCompanionStore.setState({ state: 'idle', transcript: [], activeHandoff: null });
  resetCompanionPorts();
});

afterEach(cleanup);


describe('CompanionPanelSlot', () => {
  it('renders nothing while the companion is switched off', () => {
    useUiStore.setState({ companionEnabled: false });
    renderPanel(<CompanionPanelSlot />);
    expect(screen.queryByTestId('companion-panel')).toBeNull();
  });

  it('renders the panel once enabled', () => {
    renderPanel(<CompanionPanelSlot />);
    expect(screen.queryByTestId('companion-panel')).not.toBeNull();
  });
});

describe('CompanionPanel', () => {
  it('mirrors the companion state onto the panel, and sets nothing while idle', () => {
    const { rerender } = renderPanel(<CompanionPanel />);
    expect(screen.getByTestId('companion-panel').getAttribute('data-companion-state')).toBeNull();

    useCompanionStore.setState({ state: 'listening' });
    rerender(<CompanionPanel />);
    expect(screen.getByTestId('companion-panel').getAttribute('data-companion-state')).toBe(
      'listening',
    );
  });

  it('shows the state label from the shared look table', () => {
    useCompanionStore.setState({ state: 'handoff' });
    renderPanel(<CompanionPanel />);
    expect(screen.getByTestId('companion-state-label').textContent).toBe('Agent working…');
  });

  it('calls the greet port exactly once per mount', () => {
    const greet = vi.fn();
    setCompanionPorts({ greet });

    const { rerender } = renderPanel(<CompanionPanel />);
    // A state change is what a naive `useEffect([state])` would re-fire on —
    // and greeting *causes* state changes, so it would never stop.
    useCompanionStore.setState({ state: 'greeting' });
    rerender(<CompanionPanel />);
    useCompanionStore.setState({ state: 'speaking' });
    rerender(<CompanionPanel />);

    expect(greet).toHaveBeenCalledTimes(1);
  });

  it('renders the empty-thread copy with no turns, and the turns once there are any', () => {
    const { rerender } = renderPanel(<CompanionPanel />);
    expect(screen.getByTestId('companion-thread').textContent).toContain('Nothing said yet');

    useCompanionStore.setState({
      transcript: [
        { id: 'a', role: 'companion', text: 'Good to see you.', at: 1, spoken: true },
        { id: 'b', role: 'user', text: 'start an adhoc task', at: 2, spoken: false },
      ],
    });
    rerender(<CompanionPanel />);

    expect(screen.getByText('Good to see you.')).toBeTruthy();
    expect(screen.getByText('start an adhoc task')).toBeTruthy();
  });

  it('collapses an agent turn behind its first line', () => {
    useCompanionStore.setState({
      transcript: [
        {
          id: 'a',
          role: 'agent',
          text: 'Done — 3 files changed\nand a great deal more scrollback',
          at: 1,
          spoken: false,
        },
      ],
    });
    renderPanel(<CompanionPanel />);

    // The summary line is the first non-blank line; the body is present but
    // inside the `<details>`, which is what keeps the thread a conversation.
    expect(screen.getByText('Done — 3 files changed')).toBeTruthy();
    expect(screen.getByRole('group')).toBeTruthy();
  });

  /*
    The Phase 79 follow-up's rendering half — the two things the user asked for
    that live in the thread rather than in the flow.
  */
  it('renders a companion turn as markdown and a user turn as the literal text typed', () => {
    useCompanionStore.setState({
      transcript: [
        {
          id: 'a',
          role: 'companion',
          text: '**midnite-studio** — on `main`\n\n- [a fix](https://example.test/pull/1)',
          at: Date.parse('2026-09-08T14:32:00'),
          spoken: true,
        },
        {
          id: 'b',
          // What someone typed is what they meant: a user bubble is never
          // parsed, so the asterisks survive verbatim.
          role: 'user',
          text: 'run **exec** on snake_case',
          at: Date.parse('2026-09-08T14:33:00'),
          spoken: false,
        },
      ],
    });
    renderPanel(<CompanionPanel />);

    const thread = screen.getByTestId('companion-thread');
    expect(thread.querySelector('strong')?.textContent).toBe('midnite-studio');
    expect(thread.querySelector('code')?.textContent).toBe('main');
    expect(thread.querySelector('li')).toBeTruthy();
    // Through `ExternalLink`, so a real href is on the anchor and activation
    // routes to the embedded browser rather than replacing the whole SPA.
    expect(thread.querySelector('a')?.getAttribute('href')).toBe('https://example.test/pull/1');

    expect(screen.getByText('run **exec** on snake_case')).toBeTruthy();
  });

  it('stamps every turn with its own time and starts the day with a separator', () => {
    useCompanionStore.setState({
      transcript: [
        {
          id: 'a',
          role: 'companion',
          text: 'Yesterday.',
          at: Date.parse('2026-09-07T18:05:00'),
          spoken: true,
        },
        {
          id: 'b',
          role: 'user',
          text: 'today',
          at: Date.parse('2026-09-08T09:12:00'),
          spoken: false,
        },
      ],
    });
    renderPanel(<CompanionPanel />);

    const thread = screen.getByTestId('companion-thread');
    // The raw epoch, not the rendered string — a spec that read "18:05" would
    // be asserting the runner's timezone.
    const stamps = [...thread.querySelectorAll('[data-turn-at]')].map((node) =>
      node.getAttribute('data-turn-at'),
    );
    expect(stamps).toEqual([
      String(Date.parse('2026-09-07T18:05:00')),
      String(Date.parse('2026-09-08T09:12:00')),
    ]);
    // The full instant on hover, which is where the date and the seconds live.
    expect(thread.querySelector('[data-turn-at]')?.getAttribute('title')).toBeTruthy();

    // One separator per calendar day the transcript spans, including the
    // first — a persisted transcript routinely opens on another day.
    expect([...thread.querySelectorAll('[data-turn-day]')]).toHaveLength(2);
  });
});

/**
 * The Clear-conversation control in the header.
 *
 * The transcript is the record of what was asked and there is no undo
 * anywhere in the companion, so every case below is about the *gate* as much
 * as the clearing: that the button cannot be pressed with nothing to lose,
 * that a press alone changes nothing, and that only the confirm's own button
 * empties the store.
 */
describe('the Clear conversation header control', () => {
  /*
    Scoped to the dialog, because "Clear conversation" is deliberately the
    accessible name of BOTH the header button and the confirm's primary — the
    control and the commitment say the same thing, and an unscoped
    `getByRole` finds two.
  */
  const confirmButton = () =>
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear conversation' });

  const twoTurns = [
    { id: 'a', role: 'companion' as const, text: 'Good to see you.', at: 1, spoken: true },
    { id: 'b', role: 'user' as const, text: 'start an adhoc task', at: 2, spoken: false },
  ];

  it('is present but explained-disabled while the transcript is empty', () => {
    renderPanel(<CompanionPanel />);

    const button = screen.getByTestId('companion-clear');
    // `aria-disabled`, not the native attribute: `IconButton` keeps an
    // explained disable hoverable so the tooltip can say why it is dead.
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('Clear conversation');

    fireEvent.click(button);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('goes live once there is a turn, and names the count in the confirm', () => {
    useCompanionStore.setState({ transcript: twoTurns });
    renderPanel(<CompanionPanel />);

    const button = screen.getByTestId('companion-clear');
    expect(button.getAttribute('aria-disabled')).toBeNull();

    fireEvent.click(button);
    // The blast radius, in the title and again in the warning box — a
    // conversation has no commits to list, so the number is the whole of it.
    expect(screen.getByRole('dialog', { name: 'Clear 2 turns?' })).toBeTruthy();
    expect(screen.getByText(/2 turns are deleted/)).toBeTruthy();
  });

  it('singularises the count, because "Clear 1 turns?" is how a stub reads', () => {
    useCompanionStore.setState({ transcript: [twoTurns[0]!] });
    renderPanel(<CompanionPanel />);

    fireEvent.click(screen.getByTestId('companion-clear'));
    expect(screen.getByRole('dialog', { name: 'Clear 1 turn?' })).toBeTruthy();
  });

  it('the confirm gates it: Cancel leaves the transcript alone', () => {
    useCompanionStore.setState({ transcript: twoTurns });
    renderPanel(<CompanionPanel />);

    fireEvent.click(screen.getByTestId('companion-clear'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useCompanionStore.getState().transcript).toHaveLength(2);
    expect(screen.getByText('Good to see you.')).toBeTruthy();
  });

  it('confirming empties the store and the thread lands on its empty state', () => {
    useCompanionStore.setState({ transcript: twoTurns });
    renderPanel(<CompanionPanel />);

    fireEvent.click(screen.getByTestId('companion-clear'));
    fireEvent.click(confirmButton());

    expect(useCompanionStore.getState().transcript).toEqual([]);
    expect(screen.getByTestId('companion-thread').textContent).toContain('Nothing said yet');
    // And back to disabled, with nothing left to clear.
    expect(screen.getByTestId('companion-clear').getAttribute('aria-disabled')).toBe('true');
  });

  it('cancels speech in flight, so nothing keeps talking about turns that are gone', () => {
    const interrupt = vi.fn();
    setCompanionPorts({ interrupt });
    useCompanionStore.setState({ transcript: twoTurns, state: 'speaking' });
    renderPanel(<CompanionPanel />);

    fireEvent.click(screen.getByTestId('companion-clear'));
    expect(interrupt).not.toHaveBeenCalled();

    fireEvent.click(confirmButton());
    expect(interrupt).toHaveBeenCalledTimes(1);
  });

  it('does not re-greet: the greeting is once per mount, and clearing is not a mount', () => {
    const greet = vi.fn();
    setCompanionPorts({ greet });
    useCompanionStore.setState({ transcript: twoTurns });
    renderPanel(<CompanionPanel />);
    expect(greet).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('companion-clear'));
    fireEvent.click(confirmButton());

    // `greeted` is a ref, so an emptied transcript re-renders the panel
    // without re-running the effect — which is the whole reason it is a ref
    // and not a dependency. A greeting fired here would refill the thread the
    // user just emptied, one render after they emptied it.
    expect(greet).toHaveBeenCalledTimes(1);
    expect(useCompanionStore.getState().transcript).toEqual([]);
  });
});

describe('CompanionInputBar', () => {
  it('sends on Return, newlines on Shift+Return', () => {
    const submit = vi.fn();
    setCompanionPorts({ submit });
    renderPanel(<CompanionPanel />);

    const input = screen.getByTestId('companion-input');
    fireEvent.change(input, { target: { value: 'start a swarm' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(submit).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(submit).toHaveBeenCalledWith('start a swarm');
    expect((input as HTMLTextAreaElement).value).toBe('');
  });

  it('the default submit posts the user turn itself, so the bar works before Theme E', () => {
    renderPanel(<CompanionPanel />);

    const input = screen.getByTestId('companion-input');
    fireEvent.change(input, { target: { value: '  hello  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    const transcript = useCompanionStore.getState().transcript;
    expect(transcript).toHaveLength(1);
    expect(transcript[0]).toMatchObject({ role: 'user', text: 'hello' });
  });

  it('Escape clears the field and interrupts, without closing the panel', () => {
    const interrupt = vi.fn();
    setCompanionPorts({ interrupt });
    renderPanel(<CompanionPanel />);

    const input = screen.getByTestId('companion-input');
    fireEvent.change(input, { target: { value: 'never mind' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect((input as HTMLTextAreaElement).value).toBe('');
    expect(interrupt).toHaveBeenCalled();
    expect(useUiStore.getState().companionPanelOpen).toBe(true);
  });

  it('refuses to send while the companion is thinking', () => {
    const submit = vi.fn();
    setCompanionPorts({ submit });
    useCompanionStore.setState({ state: 'thinking' });
    renderPanel(<CompanionPanel />);

    const input = screen.getByTestId('companion-input');
    fireEvent.change(input, { target: { value: 'and another' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByTestId('companion-send').getAttribute('aria-disabled')).toBe('true');
  });

  it('keeps the mic disabled until a provider reports itself available', () => {
    const micPressStart = vi.fn();
    setCompanionPorts({ micPressStart });
    const { rerender } = renderPanel(<CompanionPanel />);

    const mic = screen.getByTestId('companion-mic');
    expect(mic.getAttribute('aria-disabled')).toBe('true');
    fireEvent.pointerDown(mic);
    expect(micPressStart).not.toHaveBeenCalled();

    setCompanionPorts({ micAvailable: () => true });
    rerender(<CompanionPanel />);
    fireEvent.pointerDown(screen.getByTestId('companion-mic'));
    expect(micPressStart).toHaveBeenCalledTimes(1);
  });
});

describe('companion ports', () => {
  it('merges rather than replaces, so three modules can each register their own half', () => {
    const greet = vi.fn();
    const repeat = vi.fn();
    setCompanionPorts({ greet });
    setCompanionPorts({ repeat });

    companionPorts().greet();
    companionPorts().repeat();

    expect(greet).toHaveBeenCalledTimes(1);
    expect(repeat).toHaveBeenCalledTimes(1);
  });

  it('every member is callable before anything registers', () => {
    const ports = companionPorts();
    expect(() => {
      ports.greet();
      ports.interrupt();
      ports.repeat();
      ports.micPressStart();
      ports.micPressEnd();
    }).not.toThrow();
    expect(ports.micAvailable()).toBe(false);
  });
});
