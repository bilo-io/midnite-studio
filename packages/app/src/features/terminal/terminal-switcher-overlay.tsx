import { useCallback, useEffect, useMemo } from 'react';

import type { AgentDefinition } from '@midnite/studio-shared';
import { LuTerminal } from 'react-icons/lu';

import type { IconComponent } from '../../components/icon-button';
import { resolveAgentIcon } from '../../components/icons';
import { useOccluder } from '../../components/use-occluder';
import { useRepos } from '../../services/queries';
import { useUiStore } from '../../store/ui-store';
import { isAgentUnconfigured } from '../agent/agent-install-status';
import { useTerminalStore } from './terminal-store';
import { useAgents } from './use-agents';

/** One row of the switcher: the pinned "Terminal" option, or an installed agent. */
type SwitcherOption =
  | { kind: 'terminal'; id: 'terminal'; label: string; icon: IconComponent }
  | { kind: 'agent'; id: string; label: string; icon: IconComponent; agent: AgentDefinition };

/**
 * An App-Switcher-style HUD overlay for cycling Mod+T's targets.
 *
 * While the user holds Mod (Command on macOS, Ctrl on Linux/Windows), each
 * press of T advances through "Terminal" followed by every INSTALLED agent
 * (`isAgentUnconfigured` — the same predicate the `+` picker's
 * `buildAgentSections` greys a row with). When the user releases the
 * modifier, the overlay dismisses and either opens a plain terminal (exactly
 * what `terminal.new` did before this overlay existed) or starts a session
 * for the highlighted agent — the same `openSession` shape
 * `terminal-panel.tsx`'s own `+` menu uses.
 *
 * A not-installed agent never appears here at all: this is the Mod+T HUD's
 * whole job, not the titlebar primary-agent picker's — that surface still
 * shows every agent, installed or not, and offers to configure one that
 * isn't.
 *
 * Pattern and keyboard model copied from `BrowserSwitcherOverlay`
 * (`features/browser/browser-switcher-overlay.tsx`) rather than reused
 * directly: the two overlays commit to structurally different things (a
 * fixed 3-way enum vs. a dynamic, agent-roster-sized option list that also
 * needs a session opened as its side effect), so sharing the component would
 * have meant threading generics through it for no real duplication saved.
 */
export function TerminalSwitcherOverlay() {
  const open = useUiStore((s) => s.terminalSwitcherOpen);
  const index = useUiStore((s) => s.terminalSwitcherIndex);
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const selectedWorktreePath = useUiStore((s) => s.selectedWorktreePath);
  const { agents, status } = useAgents();
  const { data: repos } = useRepos();

  const options = useMemo<SwitcherOption[]>(() => {
    const installed = agents.filter((agent) => !isAgentUnconfigured(agent, status));
    return [
      { kind: 'terminal', id: 'terminal', label: 'Terminal', icon: LuTerminal },
      ...installed.map((agent) => ({
        kind: 'agent' as const,
        id: agent.id,
        label: agent.label,
        icon: resolveAgentIcon(agent),
        agent,
      })),
    ];
  }, [agents, status]);

  // Register as an occluder while the HUD is up — same reasoning as
  // `BrowserSwitcherOverlay`: native WebContentsView bounds must not punch
  // through it.
  useOccluder(open);

  const commit = useCallback(() => {
    // Read the highlight fresh from the store rather than the `index` this
    // render closed over: a click handler sets the index and commits in the
    // same synchronous callback, before React has re-rendered this
    // component with the new value.
    const highlighted = useUiStore.getState().terminalSwitcherIndex;
    useUiStore.getState().closeTerminalSwitcher();
    const option = options[highlighted] ?? options[0];
    if (!option || !selectedRepoId || !selectedWorktreePath) return;
    const repoName = repos?.find((r) => r.id === selectedRepoId)?.name ?? 'terminal';
    useTerminalStore.getState().openSession({
      kind: option.kind === 'agent' ? 'agent' : 'shell',
      ...(option.kind === 'agent' ? { agentId: option.agent.id } : {}),
      title: repoName,
      cwd: selectedWorktreePath,
      repoId: selectedRepoId,
    });
    // "Not expanded at all" — a session opened onto a collapsed panel would
    // be invisible until the user separately reached for `terminal.toggle`,
    // which defeats the point of this shortcut. Same rule `terminal.new`
    // enforced before this overlay existed.
    if (!useUiStore.getState().terminalOpen) useUiStore.getState().setTerminalOpen(true);
  }, [options, selectedRepoId, selectedWorktreePath, repos]);

  useEffect(() => {
    if (!open) return;

    const onKeyUp = (event: KeyboardEvent) => {
      // When Mod (Meta on Mac, Control on Linux/Windows) is released, commit.
      if (
        event.key === 'Meta' ||
        event.key === 'Control' ||
        (!event.metaKey && !event.ctrlKey)
      ) {
        commit();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        useUiStore.getState().closeTerminalSwitcher();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        commit();
        return;
      }
      if (
        event.key === 'ArrowRight' ||
        event.key === 'ArrowDown' ||
        (event.key === 'Tab' && !event.shiftKey)
      ) {
        event.preventDefault();
        event.stopPropagation();
        useUiStore.getState().cycleTerminalSwitcher(1, options.length);
        return;
      }
      if (
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowUp' ||
        (event.key === 'Tab' && event.shiftKey)
      ) {
        event.preventDefault();
        event.stopPropagation();
        useUiStore.getState().cycleTerminalSwitcher(-1, options.length);
        return;
      }
      const digit = Number(event.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= options.length) {
        event.preventDefault();
        event.stopPropagation();
        useUiStore.getState().setTerminalSwitcherIndex(digit - 1);
      }
    };

    const onBlur = () => {
      commit();
    };

    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [open, options, commit]);

  if (!open) return null;

  return (
    <div
      role="region"
      aria-label="Terminal and agent switcher"
      data-testid="terminal-switcher-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-xs select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          useUiStore.getState().closeTerminalSwitcher();
        }
      }}
    >
      <div
        role="radiogroup"
        aria-label="New terminal or agent session"
        className="flex flex-col items-center gap-3 rounded-2xl border border-border/80 bg-card/90 dark:bg-card/85 p-5 shadow-2xl backdrop-blur-xl animate-fade-in max-w-lg w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between w-full px-1">
          <span className="text-xs font-semibold text-foreground tracking-wide uppercase">
            New Terminal or Agent
          </span>
          <span className="text-[10px] text-muted-foreground">Release modifier to open</span>
        </div>

        <div className="flex flex-wrap items-start justify-center gap-3 w-full mt-1">
          {options.map((option, i) => {
            const active = i === index;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                data-testid={`terminal-switcher-option-${option.id}`}
                onClick={() => {
                  useUiStore.getState().setTerminalSwitcherIndex(i);
                  commit();
                }}
                onMouseEnter={() => useUiStore.getState().setTerminalSwitcherIndex(i)}
                className={`group flex w-20 flex-col items-center gap-2 rounded-xl border p-3 text-center transition-all cursor-pointer ${
                  active
                    ? 'border-primary bg-primary/15 ring-2 ring-primary/50 shadow-lg scale-102'
                    : 'border-border/50 bg-background/40 hover:bg-accent/40 hover:border-border'
                }`}
              >
                {/* Larger than the app's usual icon size (h-4 w-4) — this HUD
                    has room to spend, and a bigger glyph is what makes the
                    grid scannable at a glance while holding a modifier. */}
                <option.icon
                  aria-hidden
                  className="h-10 w-10 shrink-0"
                  style={
                    option.kind === 'agent' && option.agent.accent
                      ? { color: option.agent.accent }
                      : undefined
                  }
                />
                <span
                  className={`w-full truncate text-xs font-medium ${
                    active ? 'text-foreground font-semibold' : 'text-foreground/80'
                  }`}
                >
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
