import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetCompanionPorts, setCompanionPorts } from './companion-ports';
import {
  allSlashCommands,
  filterSlashCommands,
  runSlashCommand,
  slashInsertText,
} from './slash-commands';

/**
 * The companion input's "/" popover (Ad Hoc: companion input + voice
 * improvements) — pure logic, no rendering. `companion-input-bar.test.tsx`
 * covers the keyboard/popover wiring; this covers what feeds it: sourcing
 * from the existing registries, filtering/ranking, and what accepting each
 * kind of row actually does.
 */

beforeEach(() => {
  resetCompanionPorts();
});

afterEach(() => {
  resetCompanionPorts();
});

describe('allSlashCommands', () => {
  it('sources every row from an existing registry — never hand-authored', () => {
    const items = allSlashCommands();

    // The two companion-native controls.
    expect(items.some((item) => item.id === 'control:stop')).toBe(true);
    expect(items.some((item) => item.id === 'control:repeat')).toBe(true);

    // At least one AGENT_COMMANDS skill the companion can name by voice.
    expect(items.some((item) => item.kind === 'skill' && item.label === 'Adhoc Task')).toBe(true);

    // At least one COMMANDS entry the companion is allowed to run.
    expect(items.some((item) => item.kind === 'command' && item.label === 'Toggle Terminal')).toBe(
      true,
    );
  });

  it('gives every row a non-empty one-line description', () => {
    for (const item of allSlashCommands()) {
      expect(item.description.length).toBeGreaterThan(0);
    }
  });
});

describe('filterSlashCommands', () => {
  it('caps the unfiltered list for an inline popover, not a full palette', () => {
    expect(filterSlashCommands('').length).toBeLessThanOrEqual(8);
  });

  it('filters as the user types', () => {
    const results = filterSlashCommands('adhoc');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((item) => /adhoc/i.test(item.label) || /adhoc/i.test(item.description))).toBe(
      true,
    );
  });

  it('finds a control by its own label', () => {
    const results = filterSlashCommands('stop');
    expect(results.some((item) => item.id === 'control:stop')).toBe(true);
  });

  it('returns nothing for a query that matches no row', () => {
    expect(filterSlashCommands('zzzznonexistentquery')).toEqual([]);
  });
});

describe('slashInsertText', () => {
  it('is null for a command/control row — accepting one runs it, nothing to insert', () => {
    const [stop] = filterSlashCommands('stop');
    expect(stop).toBeDefined();
    expect(slashInsertText(stop!)).toBeNull();

    const [terminalToggle] = filterSlashCommands('Toggle Terminal');
    expect(terminalToggle).toBeDefined();
    expect(slashInsertText(terminalToggle!)).toBeNull();
  });

  it('inserts a skill\'s canonical phrase plus a trailing space, for the argument', () => {
    const [adhoc] = filterSlashCommands('Adhoc Task');
    expect(adhoc).toBeDefined();
    const inserted = slashInsertText(adhoc!);
    expect(inserted).not.toBeNull();
    expect(inserted?.endsWith(' ')).toBe(true);
    expect(inserted?.trim().length).toBeGreaterThan(0);
  });
});

describe('runSlashCommand', () => {
  it('submits a command row\'s label through companionPorts().submit', () => {
    const submit = vi.fn();
    setCompanionPorts({ submit });
    const [terminalToggle] = filterSlashCommands('Toggle Terminal');
    expect(terminalToggle).toBeDefined();

    runSlashCommand(terminalToggle!);

    expect(submit).toHaveBeenCalledExactlyOnceWith('Toggle Terminal');
  });

  it('calls interrupt() for the Stop control', () => {
    const interrupt = vi.fn();
    setCompanionPorts({ interrupt });
    const [stop] = filterSlashCommands('stop');
    expect(stop).toBeDefined();

    runSlashCommand(stop!);

    expect(interrupt).toHaveBeenCalledTimes(1);
  });

  it('calls repeat() for the Repeat control', () => {
    const repeat = vi.fn();
    setCompanionPorts({ repeat });
    const [repeatItem] = filterSlashCommands('repeat');
    expect(repeatItem).toBeDefined();

    runSlashCommand(repeatItem!);

    expect(repeat).toHaveBeenCalledTimes(1);
  });
});
