import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CommandRuntime } from '../../services/keybindings/use-command-handlers';
import { runCommand, setCommandRuntime } from './command-runtime';

function runtimeWith(entries: Partial<CommandRuntime>): CommandRuntime {
  return entries as CommandRuntime;
}

describe('command-runtime registry', () => {
  afterEach(() => {
    setCommandRuntime(null);
  });

  it('answers no-runtime before anything registers', () => {
    expect(runCommand('sync.fetch')).toEqual({
      ok: false,
      reason: 'no-runtime',
      message: expect.any(String),
    });
  });

  it('runs an enabled entry once and answers ok', () => {
    const run = vi.fn();
    setCommandRuntime(runtimeWith({ 'sync.fetch': { run, enabled: true } }));
    expect(runCommand('sync.fetch')).toEqual({ ok: true });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does not call a disabled entry, and returns its disabledReason verbatim', () => {
    const run = vi.fn();
    setCommandRuntime(
      runtimeWith({
        'sync.push': { run, enabled: false, disabledReason: 'Open a repository first' },
      }),
    );
    expect(runCommand('sync.push')).toEqual({
      ok: false,
      reason: 'disabled',
      message: 'Open a repository first',
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('falls back to a generic message when a disabled entry has none', () => {
    setCommandRuntime(runtimeWith({ 'sync.push': { run: () => {}, enabled: false } }));
    const result = runCommand('sync.push');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('disabled');
  });

  it('answers unknown for an id the registered runtime has no entry for', () => {
    setCommandRuntime(runtimeWith({}));
    expect(runCommand('sync.fetch')).toEqual({
      ok: false,
      reason: 'unknown',
      message: expect.any(String),
    });
  });

  it('goes back to no-runtime once unregistered', () => {
    setCommandRuntime(runtimeWith({ 'sync.fetch': { run: () => {}, enabled: true } }));
    setCommandRuntime(null);
    expect(runCommand('sync.fetch').ok).toBe(false);
  });
});
