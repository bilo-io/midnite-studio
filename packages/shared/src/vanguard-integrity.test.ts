import { describe, expect, it } from 'vitest';

import {
  canonicalJson,
  extractIntegrityContent,
  INTEGRITY_WATCHED,
  IntegrityBaselineSchema,
  integrityEntriesFor,
  integritySeverity,
  matchIntegrityEntry,
} from './vanguard-integrity';

describe('the integrity watched set', () => {
  it('gives every entry a unique id and a real reason', () => {
    const ids = INTEGRITY_WATCHED.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of INTEGRITY_WATCHED) {
      expect(entry.reason.length, entry.id).toBeGreaterThan(30);
      expect(entry.reason.endsWith('.'), entry.id).toBe(true);
    }
  });

  it('covers every path the phase doc names', () => {
    const repo = integrityEntriesFor('repo').map((entry) => `${entry.base}:${entry.path}`);
    expect(repo).toEqual(
      expect.arrayContaining([
        'worktree:.claude',
        'worktree:.codex',
        'worktree:.agents',
        'worktree:.cursor',
        'worktree:.mcp.json',
        'worktree:.githooks',
        'git-dir:hooks',
        'worktree:.vscode/settings.json',
        'worktree:.vscode/tasks.json',
        'worktree:package.json',
        'worktree:pnpm-lock.yaml',
        'worktree:package-lock.json',
        'worktree:yarn.lock',
        'worktree:Cargo.lock',
        'worktree:poetry.lock',
        'worktree:go.sum',
        'worktree:.env',
        'worktree:.npmrc',
      ]),
    );
    const user = integrityEntriesFor('user').map((entry) => entry.path);
    expect(user).toEqual(
      expect.arrayContaining([
        '.claude/settings.json',
        '.claude/plugins/installed_plugins.json',
        '.claude.json',
        '.codex/config.toml',
        '.npmrc',
        '.gitconfig',
      ]),
    );
  });

  it('grades hooks, MCP and agent config high, the rest medium', () => {
    expect(integritySeverity('hooks')).toBe('high');
    expect(integritySeverity('mcp')).toBe('high');
    expect(integritySeverity('agent-config')).toBe('high');
    for (const cls of ['scripts', 'lockfile', 'env', 'registry', 'editor', 'git-config'] as const) {
      expect(integritySeverity(cls)).toBe('medium');
    }
  });
});

describe('matchIntegrityEntry', () => {
  it('matches files, directories at any depth and root-level prefixes', () => {
    expect(matchIntegrityEntry('repo', 'worktree', '.mcp.json')?.id).toBe('repo.mcp-json');
    expect(matchIntegrityEntry('repo', 'worktree', '.claude/hooks/pre-tool.sh')?.id).toBe('repo.claude');
    expect(matchIntegrityEntry('repo', 'worktree', '.githooks/pre-commit')?.id).toBe('repo.githooks');
    expect(matchIntegrityEntry('repo', 'git-dir', 'hooks/post-checkout')?.id).toBe('repo.git-hooks');
    expect(matchIntegrityEntry('repo', 'worktree', '.env.local')?.id).toBe('repo.env');
    expect(matchIntegrityEntry('repo', 'worktree', './.env')?.id).toBe('repo.env');
  });

  it('does not match look-alikes', () => {
    expect(matchIntegrityEntry('repo', 'worktree', 'docs/.env.example')).toBeUndefined();
    expect(matchIntegrityEntry('repo', 'worktree', '.claude')).toBeUndefined();
    expect(matchIntegrityEntry('repo', 'worktree', '.claudeignore')).toBeUndefined();
    expect(matchIntegrityEntry('repo', 'worktree', 'packages/app/package.json')).toBeUndefined();
    expect(matchIntegrityEntry('repo', 'worktree', 'hooks/pre-commit')).toBeUndefined();
    expect(matchIntegrityEntry('user', 'home', '.claude/projects/x.jsonl')).toBeUndefined();
  });
});

describe('extractIntegrityContent', () => {
  it('hashes only package.json scripts, in canonical order', () => {
    const a = JSON.stringify({ name: 'x', version: '1.0.0', scripts: { b: '2', a: '1' } });
    const b = JSON.stringify({ version: '1.0.1', scripts: { a: '1', b: '2' }, name: 'x', dependencies: { y: '1' } });
    expect(extractIntegrityContent('package-json-scripts', a)).toBe(extractIntegrityContent('package-json-scripts', b));
    const c = JSON.stringify({ scripts: { a: '1', b: '2', postinstall: 'node x.js' } });
    expect(extractIntegrityContent('package-json-scripts', c)).not.toBe(extractIntegrityContent('package-json-scripts', a));
  });

  it("hashes only ~/.claude.json's MCP and allowed-tool parts", () => {
    const base = { numStartups: 1, mcpServers: { a: { command: 'x' } }, projects: { '/r': { history: [], allowedTools: ['Bash'] } } };
    const churned = { ...base, numStartups: 99, tipsHistory: { t: 1 }, projects: { '/r': { history: ['ls'], allowedTools: ['Bash'] } } };
    expect(extractIntegrityContent('claude-json-mcp', JSON.stringify(base))).toBe(
      extractIntegrityContent('claude-json-mcp', JSON.stringify(churned)),
    );
    const added = { ...base, projects: { '/r': { allowedTools: ['Bash'], mcpServers: { evil: { command: 'curl' } } } } };
    expect(extractIntegrityContent('claude-json-mcp', JSON.stringify(added))).not.toBe(
      extractIntegrityContent('claude-json-mcp', JSON.stringify(base)),
    );
  });

  it('falls back to the whole text when the JSON does not parse', () => {
    expect(extractIntegrityContent('package-json-scripts', '{oops')).toBe('{oops');
    expect(extractIntegrityContent('whole', 'abc')).toBe('abc');
  });

  it('canonicalises nested keys', () => {
    expect(canonicalJson({ b: { d: 1, c: [2, { f: 1, e: 0 }] }, a: null })).toBe('{"a":null,"b":{"c":[2,{"e":0,"f":1}],"d":1}}');
  });
});

describe('IntegrityBaselineSchema', () => {
  it('round-trips a baseline with a flagged file', () => {
    const baseline = {
      version: 1 as const,
      scopeId: 'repo-1',
      root: '/r',
      createdAt: 1,
      updatedAt: 2,
      files: {
        'worktree:.mcp.json': { hash: 'aa' },
        'git-dir:hooks/pre-commit': { hash: 'bb', flagged: { hash: 'bb', at: 2, fingerprint: 'integrity:repo-1:git-dir:hooks/pre-commit' } },
        'worktree:.env': { hash: null },
      },
    };
    expect(IntegrityBaselineSchema.parse(JSON.parse(JSON.stringify(baseline)))).toEqual(baseline);
  });
});
