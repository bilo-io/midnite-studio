import { describe, expect, it } from 'vitest';

import {
  AgentDefinitionSchema,
  AgentStatusSchema,
  BUILTIN_AGENTS,
  TerminalSessionSchema,
  type AgentDefinition,
} from './terminal';
import { AgentListResponse } from './ipc/schemas';

/**
 * The roster is the contract every terminal surface reads off, and it grew
 * from one entry to four. Every guarantee below used to be true of a list with
 * a single element in it, where "true for all agents" and "true for Claude"
 * were the same sentence — so each is re-asserted as a table over the whole
 * roster, which is what stops a fifth entry being added half-wired.
 */
describe('BUILTIN_AGENTS', () => {
  it('ships the four terminal agents the + menu offers', () => {
    expect(BUILTIN_AGENTS.map((a) => a.id)).toEqual(['claude', 'agy', 'codex', 'openclaude']);
  });

  it.each(BUILTIN_AGENTS.map((agent) => [agent.id, agent] as const))(
    'validates %s against its own schema',
    (_id, agent) => {
      expect(AgentDefinitionSchema.safeParse(agent).success).toBe(true);
    },
  );

  /**
   * The install hint is what a disabled menu item says instead of nothing, so
   * an entry without one degrades to a greyed row with no explanation — the
   * single most frustrating thing a menu can show.
   */
  it.each(BUILTIN_AGENTS.map((agent) => [agent.id, agent] as const))(
    '%s carries an install hint',
    (_id, agent) => {
      expect(agent.install).toBeTruthy();
    },
  );

  it.each(BUILTIN_AGENTS.map((agent) => [agent.id, agent] as const))(
    '%s carries a brand accent',
    (_id, agent) => {
      expect(agent.accent).toMatch(/^#[0-9a-f]{6}$/i);
    },
  );

  it('gives every agent a distinct accent, so a row is identifiable by colour', () => {
    const accents = new Set(BUILTIN_AGENTS.map((a) => a.accent.toLowerCase()));
    expect(accents.size).toBe(BUILTIN_AGENTS.length);
  });

  /**
   * `icon` defaults to `id` in the registry, so an entry only names one when
   * the two differ — `agy` is the command, `antigravity` is what the mark is
   * called. Asserting the *resolved* key is unique keeps two agents from
   * quietly sharing a glyph.
   */
  it('resolves every agent to a distinct icon key', () => {
    const keys = BUILTIN_AGENTS.map((a) => a.icon ?? a.id);
    expect(new Set(keys).size).toBe(BUILTIN_AGENTS.length);
  });

  it('starts each agent with a bare command and no args', () => {
    for (const agent of BUILTIN_AGENTS) {
      expect(agent.command).not.toMatch(/\s/);
      expect(agent.args).toEqual([]);
    }
  });
});

describe('AgentDefinitionSchema', () => {
  const minimal = { id: 'a', label: 'A', command: 'a', accent: '#ffffff' };

  it('leaves icon and install absent rather than inventing them', () => {
    const parsed = AgentDefinitionSchema.parse(minimal);
    expect(parsed.icon).toBeUndefined();
    expect(parsed.install).toBeUndefined();
  });

  it.each([
    ['icon', ''],
    ['install', ''],
  ])('rejects an empty %s', (field, value) => {
    expect(AgentDefinitionSchema.safeParse({ ...minimal, [field]: value }).success).toBe(false);
  });
});

/**
 * `agentIdMatchesKind` guarded one id when it was written. It now guards four,
 * and both directions have to hold for every one of them: an agent session
 * that cannot name its agent loses its mark AND starts a bare shell, and a
 * shell carrying an id paints a mark on a terminal running nothing.
 */
describe('agentIdMatchesKind, over the whole roster', () => {
  const base = { id: 's', title: 'repo', cwd: '/tmp', repoId: 'r', createdAt: 0 };

  it.each(BUILTIN_AGENTS.map((agent) => [agent.id] as const))(
    'accepts an agent session naming %s',
    (agentId) => {
      expect(TerminalSessionSchema.safeParse({ ...base, kind: 'agent', agentId }).success).toBe(
        true,
      );
    },
  );

  it.each(BUILTIN_AGENTS.map((agent) => [agent.id] as const))(
    'rejects a shell session carrying %s',
    (agentId) => {
      expect(TerminalSessionSchema.safeParse({ ...base, kind: 'shell', agentId }).success).toBe(
        false,
      );
    },
  );

  it('rejects an agent session that names nobody', () => {
    expect(TerminalSessionSchema.safeParse({ ...base, kind: 'agent' }).success).toBe(false);
  });

  it('accepts a plain shell', () => {
    expect(TerminalSessionSchema.safeParse({ ...base, kind: 'shell' }).success).toBe(true);
  });
});

/** Compile-time proof the optional fields are on the exported type, not just the schema. */
const _typed: AgentDefinition = {
  id: 'x',
  label: 'X',
  command: 'x',
  args: [],
  accent: '#000000',
  icon: 'x',
  install: 'npm i -g x',
};
void _typed;

/**
 * The shape `agent.list()` answers with, pinned.
 *
 * Both renderer consumers — the terminal's `+` menu and the Settings ▸ Terminal
 * roster — read this through one react-query entry, and React Query keys by KEY
 * rather than by query function: two observers on `['agents']` share whichever
 * answer landed first. A change to this shape that only one caller learned
 * about is therefore a runtime crash in the other, and nothing in TypeScript
 * sees it coming.
 */
describe('AgentListResponse', () => {
  it('carries the roster and a status list beside it', () => {
    const parsed = AgentListResponse.parse({
      agents: [...BUILTIN_AGENTS],
      status: [{ id: 'claude', installed: true, resolvedPath: '/usr/local/bin/claude' }],
    });

    expect(parsed.agents).toHaveLength(BUILTIN_AGENTS.length);
    expect(parsed.status[0]?.installed).toBe(true);
  });

  /**
   * Shorter than `agents`, or empty outright — an agent the probe could not
   * reach is omitted, and a probe that has not answered yet ships nothing. Both
   * mean "assume installed" to the renderer, which is why neither may be a
   * validation error.
   */
  it('accepts a status list shorter than the roster, and an absent one', () => {
    expect(AgentListResponse.parse({ agents: [...BUILTIN_AGENTS], status: [] }).status).toEqual([]);
    expect(AgentListResponse.parse({ agents: [...BUILTIN_AGENTS] }).status).toEqual([]);
  });

  it('keeps installed and resolvedPath independent — an install need not be a file', () => {
    const parsed = AgentStatusSchema.parse({ id: 'claude', installed: true, resolvedPath: null });

    expect(parsed).toEqual({ id: 'claude', installed: true, resolvedPath: null });
  });
});
