import { BUILTIN_AGENTS, type AgentStatus } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import {
  AntigravityIcon,
  ClaudeIcon,
  CodexIcon,
  OpenClaudeIcon,
  OpenCodeIcon,
} from '../../components/icons';
import { buildAgentSections, NO_WORKTREE, PROPRIETARY_IDS, type AgentSection } from './new-session-menu';

/**
 * Four cases, and each one greys the roster out for a different reason:
 * everything installed, one agent missing (OpenClaude is the live example —
 * the others are on the PATH of the machine this was written on), nothing
 * installed, and no worktree selected, where every row is dead for a reason
 * that has nothing to do with what is installed.
 */

const agents = [...BUILTIN_AGENTS];

const allInstalled: AgentStatus[] = agents.map((a) => ({
  id: a.id,
  installed: true,
  resolvedPath: `/usr/local/bin/${a.command}`,
}));

const build = (over: Partial<Parameters<typeof buildAgentSections>[0]> = {}) =>
  buildAgentSections({
    agents,
    status: allInstalled,
    hasWorktree: true,
    ...over,
  });

const section = (sections: AgentSection[], id: AgentSection['id']) =>
  sections.find((s) => s.id === id);

const row = (sections: AgentSection[], label: string) =>
  sections.flatMap((s) => s.rows).find((r) => r.agent.label === label);

describe('buildAgentSections — everything installed', () => {
  it('splits the roster into a Proprietary section and an Open Source one, in that order', () => {
    const sections = build();

    expect(sections.map((s) => s.id)).toEqual(['proprietary', 'open-source']);
    expect(sections.map((s) => s.label)).toEqual(['Proprietary', 'Open Source']);
  });

  it('puts every PROPRIETARY_IDS member in the proprietary section and nothing else', () => {
    const sections = build();

    expect(section(sections, 'proprietary')?.rows.map((r) => r.agent.id)).toEqual(
      agents.filter((a) => PROPRIETARY_IDS.has(a.id)).map((a) => a.id),
    );
    expect(section(sections, 'open-source')?.rows.map((r) => r.agent.id)).toEqual(
      agents.filter((a) => !PROPRIETARY_IDS.has(a.id)).map((a) => a.id),
    );
  });

  /**
   * The two new entries: Grok is xAI's own CLI, proprietary like Claude,
   * Codex, Cursor and Copilot; Goose is Block's open-source agent and lands
   * in Open Source purely by NOT being in `PROPRIETARY_IDS` — that absence is
   * what makes a roster entry "open source" in this menu.
   */
  it('lands Grok in Proprietary and Goose in Open Source', () => {
    const sections = build();

    expect(section(sections, 'proprietary')?.rows.map((r) => r.agent.id)).toContain('grok');
    expect(section(sections, 'open-source')?.rows.map((r) => r.agent.id)).toContain('goose');
    expect(section(sections, 'proprietary')?.rows.map((r) => r.agent.id)).not.toContain('goose');
    expect(section(sections, 'open-source')?.rows.map((r) => r.agent.id)).not.toContain('grok');
  });

  it('gives every row an icon', () => {
    const sections = build();
    for (const s of sections) for (const r of s.rows) expect(r.icon).toBeDefined();
  });

  it('resolves each agent to its own mark rather than to Claude multiple times', () => {
    const sections = build();

    expect(row(sections, 'Claude')?.icon).toBe(ClaudeIcon);
    expect(row(sections, 'Antigravity')?.icon).toBe(AntigravityIcon);
    expect(row(sections, 'Codex')?.icon).toBe(CodexIcon);
    expect(row(sections, 'OpenClaude')?.icon).toBe(OpenClaudeIcon);
    expect(row(sections, 'OpenCode')?.icon).toBe(OpenCodeIcon);
  });

  it('paints a live row in the agent brand accent', () => {
    const sections = build();

    expect(row(sections, 'Claude')?.iconStyle).toEqual({ color: '#D97757' });
    expect(row(sections, 'Codex')?.iconStyle).toEqual({ color: '#10A37F' });
    expect(row(sections, 'OpenCode')?.iconStyle).toEqual({ color: '#03B000' });
    expect(row(sections, 'Grok')?.iconStyle).toEqual({ color: '#000000' });
    expect(row(sections, 'Goose')?.iconStyle).toEqual({ color: '#2E7D32' });
  });

  it('leaves every row enabled', () => {
    const sections = build();
    for (const s of sections) for (const r of s.rows) expect(r.disabled).toBe(false);
  });
});

describe('buildAgentSections — one agent uninstalled', () => {
  const status = allInstalled.map((s) =>
    s.id === 'openclaude' ? { ...s, installed: false, resolvedPath: null } : s,
  );

  it('disables only the missing one', () => {
    const sections = build({ status });

    expect(row(sections, 'OpenClaude')?.disabled).toBe(true);
    expect(row(sections, 'Codex')?.disabled).toBe(false);
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
    const custom = {
      id: 'custom-agent',
      label: 'Custom Agent',
      command: 'custom-agent',
      args: [],
      accent: '#14B8A6',
    };
    const sections = build({
      agents: [custom],
      status: [{ id: 'custom-agent', installed: false, resolvedPath: null }],
    });

    expect(row(sections, 'Custom Agent')?.disabledReason).toContain('custom-agent');
  });
});

describe('buildAgentSections — nothing installed', () => {
  const status: AgentStatus[] = agents.map((a) => ({
    id: a.id,
    installed: false,
    resolvedPath: null,
  }));

  it('disables every agent', () => {
    const sections = build({ status });

    for (const a of agents) expect(row(sections, a.label)?.disabled).toBe(true);
  });

  it('gives each of them its own hint rather than one shared message', () => {
    const sections = build({ status });
    const reasons = agents.map((a) => row(sections, a.label)?.disabledReason);

    expect(new Set(reasons).size).toBe(agents.length);
  });
});

describe('buildAgentSections — no worktree selected', () => {
  it('disables every row and says why', () => {
    const sections = build({ hasWorktree: false });

    for (const s of sections) {
      for (const r of s.rows) {
        expect(r.disabled).toBe(true);
        expect(r.disabledReason).toBe(NO_WORKTREE);
      }
    }
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
    const sections = build({ hasWorktree: false, status });

    expect(row(sections, 'OpenClaude')?.disabledReason).toBe(NO_WORKTREE);
  });
});

describe('buildAgentSections — an unprobed roster', () => {
  /**
   * The failure posture, and the one that matters most: a probe that could not
   * answer omits the agent, and absent means "assume it works". A slow rc file
   * must never be the reason `claude` is greyed out on a machine it is
   * installed on.
   */
  it('leaves an agent with no status enabled', () => {
    const sections = build({ status: [] });

    for (const s of sections) {
      for (const r of s.rows) {
        expect(r.disabled).toBe(false);
        expect(r.disabledReason).toBeUndefined();
      }
    }
  });

  it('disables only the agents the probe actually answered for', () => {
    const sections = build({
      status: [{ id: 'openclaude', installed: false, resolvedPath: null }],
    });

    expect(row(sections, 'OpenClaude')?.disabled).toBe(true);
    expect(row(sections, 'Claude')?.disabled).toBe(false);
    expect(row(sections, 'Antigravity')?.disabled).toBe(false);
  });
});

describe('buildAgentSections — an empty roster', () => {
  it('returns no sections at all', () => {
    expect(build({ agents: [], status: [] })).toEqual([]);
  });
});

describe('buildAgentSections — a roster with only one side represented', () => {
  it('omits the other section entirely rather than returning it empty', () => {
    const onlyOpenSource = agents.filter((a) => !PROPRIETARY_IDS.has(a.id));
    const sections = build({ agents: onlyOpenSource, status: [] });

    expect(sections.map((s) => s.id)).toEqual(['open-source']);
  });
});
