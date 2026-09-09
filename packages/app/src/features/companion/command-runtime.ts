import type { CommandId } from '@midnite/studio-shared';

import type { CommandRuntime } from '../../services/keybindings/use-command-handlers';

/**
 * The seam between a `CommandId` and the render that can actually run it
 * (Phase 81 Theme A, Finding 3).
 *
 * `useCommandHandlers()` rebuilds a fresh `CommandRuntime` every render
 * (`use-command-handlers.ts:61`) and is a hook — nothing outside a render can
 * call it, but the companion's `runtime.ts` is plain functions over
 * `getState()` that outlive the render that started them. This is the same
 * pattern `commit-box-store.ts`/`theme-import-command-store.ts`/
 * `workflow-run-command-store.ts`/`active-panel.ts` already use for exactly
 * this problem — a module-level registry the owning component writes into on
 * mount, rather than a store (there is nothing here worth subscribing to; the
 * companion calls `runCommand` once per turn, it does not render off it).
 *
 * `app.tsx` calls `setCommandRuntime(runtime)` from an effect keyed on the
 * runtime's identity, **only when `bridge().windowRole === 'main'`** — a
 * popout's own `useCommandHandlers()` runs against its own (largely disabled)
 * store instance, and registering it here would let a companion running in
 * that popout's window quietly execute commands the popout cannot actually
 * carry out. The scope guardrail ("every action executes in the main
 * window") is enforced by never registering anywhere else, not by a check
 * inside `runCommand`.
 */
export function setCommandRuntime(runtime: CommandRuntime | null): void {
  current = runtime;
}

let current: CommandRuntime | null = null;

export type RunCommandResult =
  | { ok: true }
  | { ok: false; reason: 'unknown' | 'disabled' | 'no-runtime'; message: string };

/**
 * Run one `CommandId` through whichever `CommandRuntime` the main window's
 * `app.tsx` last registered.
 *
 * Never throws, and never runs a disabled entry's `run()` — `message` on a
 * `disabled` result is `entry.disabledReason` verbatim (falling back to a
 * generic sentence only if a future entry ever omits one), because it is
 * meant to be spoken, not logged. `no-runtime` covers both "no window has
 * registered one yet" (`app.tsx` has not mounted) and "this window is a
 * popout" (Theme B relays instead of calling this directly in that case).
 */
export function runCommand(id: CommandId): RunCommandResult {
  if (!current) {
    return { ok: false, reason: 'no-runtime', message: 'There is no window to run that in yet.' };
  }
  const entry = current[id];
  if (!entry) {
    return { ok: false, reason: 'unknown', message: `I don't know a command called ${id}.` };
  }
  if (!entry.enabled) {
    return {
      ok: false,
      reason: 'disabled',
      message: entry.disabledReason ?? 'That is not available right now.',
    };
  }
  entry.run();
  return { ok: true };
}
