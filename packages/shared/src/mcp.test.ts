import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  MCP_TOOL_IDS,
  MCP_TOOLS,
  type McpToolId,
} from './mcp';

describe('MCP_TOOLS', () => {
  it('derives MCP_TOOL_IDS from the registry, never a hand-maintained list', () => {
    expect(MCP_TOOL_IDS).toEqual(Object.keys(MCP_TOOLS));
  });

  it('every entry is read-only', () => {
    for (const id of MCP_TOOL_IDS) {
      expect(MCP_TOOLS[id].readOnly).toBe(true);
    }
  });

  it('every entry’s id matches the key it is registered under', () => {
    for (const id of MCP_TOOL_IDS) {
      expect(MCP_TOOLS[id].id).toBe(id);
    }
  });

  it('every description obeys the stated rule: ≤220 chars, one sentence, names a backticked command', () => {
    for (const id of MCP_TOOL_IDS) {
      const { description } = MCP_TOOLS[id];
      expect(description.length, `${id} description length`).toBeLessThanOrEqual(220);
      expect(description, `${id} description should read as one sentence`).not.toMatch(/\.\s+\S/);
      expect(description, `${id} description should name the command it replaces`).toMatch(/`[^`]+`/);
      expect(description, `${id} description should begin with a verb`).toMatch(/^[A-Z][a-z]+s\b/);
    }
  });

  it('imports nothing but zod and sibling shared modules', () => {
    const here = join(__dirname, 'mcp.ts');
    const source = readFileSync(here, 'utf8');
    const specifiers = [...source.matchAll(/from\s+'([^']+)'/g)]
      .map((m) => m[1])
      .filter((specifier): specifier is string => typeof specifier === 'string');
    expect(specifiers.length).toBeGreaterThan(0);
    for (const specifier of specifiers) {
      const isZod = specifier === 'zod';
      const isSibling = specifier.startsWith('./') || specifier.startsWith('../');
      expect(isZod || isSibling, `unexpected import in mcp.ts: ${specifier}`).toBe(true);
    }
  });

  /*
   * A minimal, hand-built value per output schema — not the real fixtures
   * produced by git-engine's commands. `shared` may not import
   * `@midnite/studio-git-engine` (package boundary), so the check that a
   * handler's REAL return value parses is `tools.test.ts` in
   * `packages/desktop/src/main/mcp/` instead; this is the narrower guarantee
   * that each declared output schema can parse *some* well-formed value at
   * all, catching a schema that is accidentally unsatisfiable.
   */
  const minimalFixtures: Record<McpToolId, unknown> = {
    'repo.list': [],
    'repo.resolve': {
      repo: { id: 'repo:/x', path: '/x', name: 'x', headRef: 'main', worktrees: [] },
      branch: 'main',
    },
    'status.get': { branch: { head: 'main', oid: null, upstream: null, ahead: 0, behind: 0, unborn: true, detached: false }, entries: [], inProgress: null },
    'graph.log': [],
    'diff.file': {
      path: 'a.ts',
      oldPath: null,
      change: 'modified',
      binary: false,
      oldMode: null,
      newMode: null,
      hunks: [],
      insertions: 0,
      deletions: 0,
      contextLines: 3,
      truncated: false,
      droppedLines: 0,
    },
    'branch.list': [],
    'forge.pulls': { cli: { reason: 'ready', binPath: '/usr/bin/gh', hint: '' }, pulls: [], error: null },
    'forge.checks': {
      cli: { reason: 'ready', binPath: '/usr/bin/gh', hint: '' },
      runs: [],
      error: null,
      verdict: null,
    },
  };

  it('every output schema parses a minimal well-formed value', () => {
    for (const id of MCP_TOOL_IDS) {
      const result = MCP_TOOLS[id].output.safeParse(minimalFixtures[id]);
      expect(result.success, `${id} output schema rejected its own minimal fixture`).toBe(true);
    }
  });

  it('every input schema parses a minimal repo-scoped value where applicable', () => {
    const base = { repoPath: '/some/repo' };
    const perTool: Partial<Record<McpToolId, unknown>> = {
      'repo.list': {},
      'diff.file': { ...base, path: 'a.ts' },
    };
    for (const id of MCP_TOOL_IDS) {
      const input = perTool[id] ?? base;
      const result = MCP_TOOLS[id].input.safeParse(input);
      expect(result.success, `${id} input schema rejected ${JSON.stringify(input)}`).toBe(true);
    }
  });
});
