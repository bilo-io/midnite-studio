import { BUILTIN_AGENTS, type AgentStatus } from '@midnite/git-shared';
import { Terminal } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { AntigravityIcon, ClaudeIcon, CodexIcon, OpenClaudeIcon } from '../../components/icons';
import { buildNewSessionMenu } from './new-session-menu';

/**
 * Four cases, and each one greys the menu out for a different reason:
 * everything installed, one agent missing (OpenClaude is the live example —
 * the other three are on the PATH of the machine this was written on), nothing
 * installed, and no worktree selected, where every row is dead for a reason
 * that has nothing to do with what is installed.
 */

const agents = [...BUILTIN_AGENTS];

const allInstalled: AgentStatus[] = agents.map((a) => ({
  id: a.id,
  installed: true,
  resolvedPath: `/usr/local/bin/${a.command}`,
}));

const build = (over: Partial<Parameters<typeof buildNewSessionMenu>[0]> = {}) =>
  buildNewSessionMenu({
    agents,
    status: allInstalled,
    hasWorktree: true,
    onNewTerminal: vi.fn(),
    onNewAgent: vi.fn(),
    ...over,
  });

/** Every non-separator row, which is what every assertion below is about. */
const rows = (items: ReturnType<typeof build>) =>
  items.filter((item): item is Extract<typeof item, { label: string }> => item.type !== 'separator');

const row = (items: ReturnType<typeof build>, label: string) =>
  rows(items).find((r) => r.label === label);

describe('buildNewSessionMenu — everything installed', () => {
  it('is flat: New Terminal, a separator, then one row per agent', () => {
    const items = build();

    expect(items[0]).toMatchObject({ label: 'New Terminal' });
    expect(items[1]).toEqual({ type: 'separator' });
    expect(rows(items).map((r) => r.label)).toEqual([
      'New Terminal',
      'Claude Code',
      'Antigravity',
      'Codex',
      'OpenClaude',
    ]);
  });

  /**
   * The `New Agent — ` prefix existed to disambiguate one entry from a heading.
   * With four named agents the label IS the disambiguation, and the prefix
   * would just be four copies of the same two words.
   */
  it('drops the "New Agent —" prefix', () => {
    for (const r of rows(build())) expect(r.label).not.toContain('New Agent');
  });

  it('gives every row an icon, so the gutter is never ragged', () => {
    for (const r of rows(build())) expect(r.icon).toBeDefined();
    expect(row(build(), 'New Terminal')?.icon).toBe(Terminal);
  });

  it('resolves each agent to its own mark rather than to Claude four times', () => {
    const items = build();

    expect(row(items, 'Claude Code')?.icon).toBe(ClaudeIcon);
    expect(row(items, 'Antigravity')?.icon).toBe(AntigravityIcon);
    expect(row(items, 'Codex')?.icon).toBe(CodexIcon);
    expect(row(items, 'OpenClaude')?.icon).toBe(OpenClaudeIcon);
  });

  it('paints a live row in the agent brand accent', () => {
    expect(row(build(), 'Claude Code')?.iconStyle).toEqual({ color: '#D97757' });
    expect(row(build(), 'Codex')?.iconStyle).toEqual({ color: '#10A37F' });
  });

  it('leaves every row enabled', () => {
    for (const r of rows(build())) expect(r.disabled).toBeUndefined();
  });

  it('starts a plain terminal from New Terminal and the agent from its own row', () => {
    const onNewTerminal = vi.fn();
    const onNewAgent = vi.fn();
    const items = build({ onNewTerminal, onNewAgent });

    row(items, 'New Terminal')?.onSelect?.();
    row(items, 'Codex')?.onSelect?.();

    expect(onNewTerminal).toHaveBeenCalledOnce();
    expect(onNewAgent).toHaveBeenCalledWith(agents.find((a) => a.id === 'codex'));
  });
});

describe('buildNewSessionMenu — one agent uninstalled', () => {
  const status = allInstalled.map((s) =>
    s.id === 'openclaude' ? { ...s, installed: false, resolvedPath: null } : s,
  );

  it('disables only the missing one', () => {
    const items = build({ status });

    expect(row(items, 'OpenClaude')?.disabled).toBe(true);
    expect(row(items, 'Codex')?.disabled).toBeUndefined();
    expect(row(items, 'New Terminal')?.disabled).toBeUndefined();
  });

  /**
   * A session that would open and immediately print `command not found` becomes
   * an explanation instead. That is the entire point of `install`.
   */
  it("says how to install it, in the roster's own words", () => {
    expect(row(build({ status }), 'OpenClaude')?.disabledReason).toBe(
      'npm i -g @gitlawb/openclaude',
    );
  });

  it('drops the accent on a dead row, so grey means unavailable', () => {
    expect(row(build({ status }), 'OpenClaude')?.iconStyle).toBeUndefined();
  });

  it('still gives the dead row its mark — it is unavailable, not unknown', () => {
    expect(row(build({ status }), 'OpenClaude')?.icon).toBe(OpenClaudeIcon);
  });

  it('falls back to a sentence when a user-added agent has no install hint', () => {
    const custom = { id: 'aider', label: 'Aider', command: 'aider', args: [], accent: '#14B8A6' };
    const items = build({
      agents: [custom],
      status: [{ id: 'aider', installed: false, resolvedPath: null }],
    });

    expect(row(items, 'Aider')?.disabledReason).toContain('aider');
  });
});

describe('buildNewSessionMenu — nothing installed', () => {
  const status: AgentStatus[] = agents.map((a) => ({
    id: a.id,
    installed: false,
    resolvedPath: null,
  }));

  it('disables every agent but leaves New Terminal alone', () => {
    const items = build({ status });

    expect(row(items, 'New Terminal')?.disabled).toBeUndefined();
    for (const a of agents) expect(row(items, a.label)?.disabled).toBe(true);
  });

  it('gives each of them its own hint rather than one shared message', () => {
    const items = build({ status });
    const reasons = agents.map((a) => row(items, a.label)?.disabledReason);

    expect(new Set(reasons).size).toBe(agents.length);
  });
});

describe('buildNewSessionMenu — no worktree selected', () => {
  it('disables everything, including New Terminal', () => {
    const items = build({ hasWorktree: false });

    for (const r of rows(items)) expect(r.disabled).toBe(true);
  });

  /**
   * The worktree reason wins over the install hint. There is nowhere to open a
   * session at all, so telling the user how to install OpenClaude would answer
   * a question they have not reached yet.
   */
  it('says so even for an agent that is also missing', () => {
    const status = allInstalled.map((s) =>
      s.id === 'openclaude' ? { ...s, installed: false, resolvedPath: null } : s,
    );
    const items = build({ hasWorktree: false, status });

    for (const r of rows(items)) expect(r.disabledReason).toBe('No worktree selected');
  });
});

describe('buildNewSessionMenu — an unprobed roster', () => {
  /**
   * The failure posture, and the one that matters most: a probe that could not
   * answer omits the agent, and absent means "assume it works". A slow rc file
   * must never be the reason `claude` is greyed out on a machine it is
   * installed on.
   */
  it('leaves an agent with no status enabled', () => {
    const items = build({ status: [] });

    for (const r of rows(items)) {
      expect(r.disabled).toBeUndefined();
      expect(r.disabledReason).toBeUndefined();
    }
  });

  it('disables only the agents the probe actually answered for', () => {
    const items = build({
      status: [{ id: 'openclaude', installed: false, resolvedPath: null }],
    });

    expect(row(items, 'OpenClaude')?.disabled).toBe(true);
    expect(row(items, 'Claude Code')?.disabled).toBeUndefined();
    expect(row(items, 'Antigravity')?.disabled).toBeUndefined();
  });
});

describe('buildNewSessionMenu — an empty roster', () => {
  it('is New Terminal alone, with no trailing separator', () => {
    const items = build({ agents: [], status: [] });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ label: 'New Terminal' });
  });
});
