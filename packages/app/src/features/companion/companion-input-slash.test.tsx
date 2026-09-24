import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCompanionStore } from '../../store/companion-store';
import { useUiStore } from '../../store/ui-store';
import { CompanionPanel } from './companion-panel';
import { resetCompanionPorts, setCompanionPorts } from './companion-ports';
import { renderPanel } from './render-panel';

/**
 * The companion input's "/" slash-command popover (Ad Hoc: companion input +
 * voice improvements) — the keyboard/popover half. `slash-commands.test.ts`
 * covers the pure filtering/insertion logic this drives; this file covers
 * the textarea wiring: when the popover opens, how Up/Down/Tab/Enter/Escape
 * behave while it is, and what accepting a row actually does to the value.
 *
 * vitest/jsdom throughout — this is store transitions and DOM text/roles
 * behind synthetic keyboard events, none of which needs a real browser.
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
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    value: 600,
  });
});

beforeEach(() => {
  resetCompanionPorts();
  useUiStore.setState({ companionEnabled: true, companionPanelOpen: true });
  useCompanionStore.setState({ state: 'idle', transcript: [] });
});

afterEach(() => {
  cleanup();
  resetCompanionPorts();
});

const input = (): HTMLTextAreaElement => screen.getByTestId('companion-input') as HTMLTextAreaElement;
const type = (text: string): void => {
  fireEvent.change(input(), { target: { value: text } });
};

describe('opening and filtering', () => {
  it('opens the popover on a bare "/"', () => {
    renderPanel(<CompanionPanel />);
    type('/');
    expect(screen.getByTestId('companion-slash-popover')).not.toBeNull();
  });

  it('is not open for ordinary text, even text that contains a slash', () => {
    renderPanel(<CompanionPanel />);
    type('fix a/b split');
    expect(screen.queryByTestId('companion-slash-popover')).toBeNull();
  });

  it('closes once a query with no matches is typed', () => {
    renderPanel(<CompanionPanel />);
    type('/zzzznonexistentquery');
    expect(screen.queryByTestId('companion-slash-popover')).toBeNull();
  });

  it('closes the instant the slash token gets a trailing word — the popover is done, an argument has started', () => {
    renderPanel(<CompanionPanel />);
    type('/adhoc write the changelog');
    expect(screen.queryByTestId('companion-slash-popover')).toBeNull();
  });

  it('filters as the user types', () => {
    renderPanel(<CompanionPanel />);
    type('/stop');
    expect(screen.getByTestId('companion-slash-item-control:stop')).not.toBeNull();
  });
});

describe('keyboard navigation', () => {
  it('Down/Up move the highlighted row without changing the textarea value', () => {
    renderPanel(<CompanionPanel />);
    type('/');
    const before = input().value;

    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'ArrowUp' });

    expect(input().value).toBe(before);
    expect(screen.getByTestId('companion-slash-popover')).not.toBeNull();
  });

  it('Tab accepts the highlighted row', () => {
    renderPanel(<CompanionPanel />);
    type('/stop');
    fireEvent.keyDown(input(), { key: 'Tab' });
    // A control row runs immediately and clears the box — see the "accepting a
    // control" describe block below for the run assertion itself.
    expect(input().value).toBe('');
  });

  it('Enter accepts the highlighted (default: top) row, not send/newline', () => {
    const submit = vi.fn();
    setCompanionPorts({ submit });
    renderPanel(<CompanionPanel />);
    // "fetch" matches exactly one companion-safe command's label ("Fetch"),
    // so the top row is deterministic without relying on the ranker's tie-
    // breaking between several close scores.
    type('/fetch');

    fireEvent.keyDown(input(), { key: 'Enter' });

    // A `command` row's accept path is companionPorts().submit(label) — the
    // Enter that would otherwise have sent the literal "/fetch" text instead
    // ran the row.
    expect(submit).toHaveBeenCalledExactlyOnceWith('Fetch');
  });

  it('Escape closes the popover without interrupting speech — a plain Escape does', () => {
    const interrupt = vi.fn();
    setCompanionPorts({ interrupt });
    renderPanel(<CompanionPanel />);
    type('/');

    fireEvent.keyDown(input(), { key: 'Escape' });

    expect(screen.queryByTestId('companion-slash-popover')).toBeNull();
    expect(interrupt).not.toHaveBeenCalled();
  });

  it('a plain Escape (no popover open) still interrupts, unchanged', () => {
    const interrupt = vi.fn();
    setCompanionPorts({ interrupt });
    renderPanel(<CompanionPanel />);
    type('hello');

    fireEvent.keyDown(input(), { key: 'Escape' });

    expect(interrupt).toHaveBeenCalledTimes(1);
    expect(input().value).toBe('');
  });
});

describe('accepting a row', () => {
  it('clicking a control row runs it through companionPorts()', () => {
    const repeat = vi.fn();
    setCompanionPorts({ repeat });
    renderPanel(<CompanionPanel />);
    type('/repeat');

    fireEvent.mouseDown(screen.getByTestId('companion-slash-item-control:repeat'));

    expect(repeat).toHaveBeenCalledTimes(1);
    expect(input().value).toBe('');
  });

  it('accepting a skill row inserts its phrase plus a trailing space, unsent', () => {
    const submit = vi.fn();
    setCompanionPorts({ submit });
    renderPanel(<CompanionPanel />);
    type('/adhoc');

    const skillRow = screen.getAllByTestId(/^companion-slash-item-skill:/)[0];
    expect(skillRow).toBeDefined();
    fireEvent.mouseDown(skillRow!);

    expect(input().value.endsWith(' ')).toBe(true);
    expect(input().value.trim().length).toBeGreaterThan(0);
    // Unsent — the user still finishes the sentence and presses Return.
    expect(submit).not.toHaveBeenCalled();
    expect(screen.queryByTestId('companion-slash-popover')).toBeNull();
  });

  it('accepting a command row submits its label and clears the box', () => {
    const submit = vi.fn();
    setCompanionPorts({ submit });
    renderPanel(<CompanionPanel />);
    type('/terminal');

    fireEvent.mouseDown(screen.getByTestId('companion-slash-item-command:terminal.toggle'));

    expect(submit).toHaveBeenCalledExactlyOnceWith('Toggle Terminal');
    expect(input().value).toBe('');
  });
});

/*
  A smoke test that the ordinary send path (Theme D/E's submit) is
  unaffected — the popover is additive to the existing input bar, not a
  replacement surface.
*/
it('leaves the ordinary send path untouched once the popover has never opened', () => {
  const submit = vi.fn();
  setCompanionPorts({ submit });
  renderPanel(<CompanionPanel />);
  type('plain message, no slash');
  fireEvent.keyDown(input(), { key: 'Enter' });
  expect(submit).toHaveBeenCalledExactlyOnceWith('plain message, no slash');
});
