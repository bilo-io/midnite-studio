import { describe, expect, it } from 'vitest';

import {
  BUILTIN_AGENTS,
  buildProfileHeadlessArgv,
  CompanionAskRequest,
  matchCustomAgent,
  parseAskReply,
  parseIntent,
  type CompanionVocabulary,
} from './index';

/** Phase 154 Theme H — the companion can use a custom agent. */

const customAgents = [
  { id: 'profile-rev', name: 'Reviewer' },
  { id: 'profile-ship', name: 'Ship It' },
];
const vocabulary: CompanionVocabulary = {
  views: [],
  settingsPages: [],
  commands: [],
  skills: [],
  repos: [],
  customAgents,
};

const agent = (id: string) => {
  const found = BUILTIN_AGENTS.find((a) => a.id === id);
  if (!found) throw new Error(`no builtin ${id}`);
  return found;
};

describe('matchCustomAgent', () => {
  it.each([
    ['use Reviewer', 'profile-rev'],
    ['switch to reviewer', 'profile-rev'],
    ['switch over to the Reviewer agent', 'profile-rev'],
    ['set agent to ship it', 'profile-ship'],
    ['pick my custom agent Ship It', 'profile-ship'],
  ])('%s → %s', (line, id) => {
    expect(matchCustomAgent(line, customAgents)).toBe(id);
  });

  it('needs a switch verb and an exact name', () => {
    expect(matchCustomAgent('Reviewer', customAgents)).toBeNull();
    expect(matchCustomAgent('use Review', customAgents)).toBeNull();
    expect(matchCustomAgent('use Reviewer', [])).toBeNull();
  });
});

describe('parseIntent — custom agents', () => {
  it('reads a custom agent name as a switchAgent with its profile id', () => {
    expect(parseIntent('Use Reviewer.', vocabulary)).toEqual({ kind: 'switchAgent', agentId: 'profile-rev' });
    expect(parseIntent('please switch to Ship It', vocabulary)).toEqual({ kind: 'switchAgent', agentId: 'profile-ship' });
  });

  it('keeps built-in switches when no custom agent matches', () => {
    expect(parseIntent('switch to codex', vocabulary)).toEqual({ kind: 'switchAgent', agentId: 'codex', modelId: null });
  });

  it('prefers a custom agent that shares a built-in name', () => {
    const shadow = { ...vocabulary, customAgents: [{ id: 'profile-c', name: 'Codex' }] };
    expect(parseIntent('use codex', shadow)).toEqual({ kind: 'switchAgent', agentId: 'profile-c' });
  });
});

describe('the ask contract', () => {
  it('accepts a profile id and refuses anything else', () => {
    const base = { kind: 'route', text: 'hi', repoPath: null };
    expect(CompanionAskRequest.safeParse({ ...base, agentProfileId: 'profile-rev' }).success).toBe(true);
    expect(CompanionAskRequest.safeParse({ ...base, agentProfileId: '../etc' }).success).toBe(false);
  });

  it('never lets the CLI claim a fallback', () => {
    const reply = parseAskReply('{"say":"ok","agentProfileFallback":"deleted"}');
    expect(reply).toEqual({ say: 'ok' });
  });
});

describe('buildProfileHeadlessArgv', () => {
  const launch = { command: '/app/node', args: ['shim.js', '--socket', '/s.sock'], env: { ELECTRON_RUN_AS_NODE: '1' } };

  it('assembles Claude: print mode, model, private MCP and the prompt file flag, unquoted', () => {
    const argv = buildProfileHeadlessArgv({
      base: agent('claude'),
      model: 'opus',
      promptPath: '/p/profile-rev.md',
      launch,
      restricted: true,
    });
    expect(argv).not.toBeNull();
    const words = argv as string[];
    expect(words.slice(0, 1)).toEqual(['-p']);
    expect(words).toContain('--strict-mcp-config');
    const config = words[words.indexOf('--mcp-config') + 1] as string;
    expect(JSON.parse(config)).toEqual({ mcpServers: { midnite: launch } });
    expect(words.slice(-2)).toEqual(['--append-system-prompt-file', '/p/profile-rev.md']);
    expect(words.some((w) => w.startsWith("'"))).toBe(false);
  });

  it('leaves the prompt file out for a CLI that takes it as text, and strict mode out when unrestricted', () => {
    const argv = buildProfileHeadlessArgv({ base: agent('codex'), model: 'default', promptPath: '/p/x.md', launch, restricted: false });
    expect(argv?.[0]).toBe('exec');
    expect(argv).not.toContain('--append-system-prompt-file');
    expect(argv).toContain('-c');
  });

  it('is null for a base with no print mode, and has no MCP words without a socket', () => {
    const unknown = { id: 'mystery', label: 'Mystery', command: 'mystery', args: [], accent: '#000000' };
    expect(buildProfileHeadlessArgv({ base: unknown, model: 'default', promptPath: null, launch: null, restricted: false })).toBeNull();
    expect(buildProfileHeadlessArgv({ base: agent('claude'), model: 'default', promptPath: null, launch: null, restricted: false })).toEqual(['-p']);
  });
});
