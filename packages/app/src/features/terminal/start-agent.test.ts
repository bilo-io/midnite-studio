import { beforeEach, describe, expect, it } from 'vitest';

import { agentInvocationArgs, startAgent, toAgentPrompt } from './start-agent';
import { useTerminalStore } from './terminal-store';
import { useUiStore } from '../../store/ui-store';

describe('toAgentPrompt', () => {
  it('leaves the prompt untouched for Claude and Antigravity — both read /name directly', () => {
    expect(toAgentPrompt('/midnite-create', 'claude')).toBe('/midnite-create');
    expect(toAgentPrompt('/midnite-create', 'agy')).toBe('/midnite-create');
  });

  it("rewrites every leading /token to $token for Codex, which doesn't recognise /name", () => {
    expect(toAgentPrompt('/midnite-create', 'codex')).toBe('$midnite-create');
    expect(toAgentPrompt('/loop /midnite-create', 'codex')).toBe('$loop $midnite-create');
  });

  it('leaves a plain-sentence prompt untouched for any agent', () => {
    expect(toAgentPrompt('fix the flaky retry test', 'codex')).toBe('fix the flaky retry test');
  });
});

describe('agentInvocationArgs', () => {
  it('adds nothing for bare interactive prompts (Claude, Cursor, Grok, Cline, Kilo)', () => {
    expect(agentInvocationArgs('claude')).toEqual([]);
    expect(agentInvocationArgs('cursor')).toEqual([]);
    expect(agentInvocationArgs('grok')).toEqual([]);
    expect(agentInvocationArgs('cline')).toEqual([]);
    expect(agentInvocationArgs('kilo')).toEqual([]);
  });

  it('runs Codex with exec for prompt invocation', () => {
    expect(agentInvocationArgs('codex')).toEqual(['exec']);
  });

  it('runs Antigravity interactively behind --prompt-interactive', () => {
    expect(agentInvocationArgs('agy')).toEqual(['--prompt-interactive']);
  });

  it('runs OpenCode with --prompt for interactive mode', () => {
    expect(agentInvocationArgs('opencode')).toEqual(['--prompt']);
  });

  it('runs Copilot with suggest for interactive mode', () => {
    expect(agentInvocationArgs('copilot')).toEqual(['suggest']);
  });

  it('runs Aider with --message for interactive mode', () => {
    expect(agentInvocationArgs('aider')).toEqual(['--message']);
  });

  it('runs OpenClaude with chat for interactive mode', () => {
    expect(agentInvocationArgs('openclaude')).toEqual(['chat']);
  });

  it('runs Goose with session start --instruction for interactive mode', () => {
    expect(agentInvocationArgs('goose')).toEqual(['session', 'start', '--instruction']);
  });

  it('supports headless mode for all CLIs', () => {
    expect(agentInvocationArgs('claude', 'headless')).toEqual(['-p']);
    expect(agentInvocationArgs('agy', 'headless')).toEqual(['-p']);
    expect(agentInvocationArgs('codex', 'headless')).toEqual(['exec']);
    expect(agentInvocationArgs('opencode', 'headless')).toEqual(['run']);
    expect(agentInvocationArgs('cursor', 'headless')).toEqual(['-p']);
    expect(agentInvocationArgs('grok', 'headless')).toEqual(['-p']);
    expect(agentInvocationArgs('copilot', 'headless')).toEqual(['explain']);
    expect(agentInvocationArgs('cline', 'headless')).toEqual(['--auto-approve', 'true']);
    expect(agentInvocationArgs('aider', 'headless')).toEqual(['--yes-always', '--message']);
    expect(agentInvocationArgs('openclaude', 'headless')).toEqual(['--bg']);
    expect(agentInvocationArgs('kilo', 'headless')).toEqual(['run']);
    expect(agentInvocationArgs('goose', 'headless')).toEqual(['run', '-t']);
  });
});

describe('startAgent — the words that reach the shell', () => {
  beforeEach(() => {
    useTerminalStore.setState({ sessions: [], activeId: null, states: {}, pendingInput: {} });
  });

  function queued(over: Partial<Parameters<typeof startAgent>[0]> = {}): string {
    const session = startAgent({
      repoId: 'r1',
      cwd: '/repo',
      title: 'Patrol',
      prompt: '/loop /pr-review',
      agentId: 'claude',
      command: 'claude',
      surface: 'fab',
      ...over,
    });
    return useTerminalStore.getState().pendingInput[session.id] ?? '';
  }

  it('quotes the prompt as one word, with no extra flags by default', () => {
    expect(queued()).toBe("claude '/loop /pr-review'");
  });

  it('puts extra flags ahead of the prompt — a --model after it would be read as text', () => {
    expect(queued({ extraArgs: ['--model', 'claude-opus-5'] })).toBe(
      "claude --model claude-opus-5 '/loop /pr-review'",
    );
  });

  it('keeps the agent’s own invocation args after the extras and before the prompt', () => {
    expect(queued({ agentId: 'codex', command: 'codex', extraArgs: ['--sandbox'], mode: 'headless' })).toBe(
      "codex --sandbox exec '$loop $pr-review'",
    );
  });

  it('launches agy with --prompt-interactive ahead of the prompt by default', () => {
    expect(
      queued({
        agentId: 'agy',
        command: 'agy',
        prompt: 'Review this repository and ask before changing files',
      }),
    ).toBe("agy --prompt-interactive 'Review this repository and ask before changing files'");
  });

  it('honours explicit headless mode when specified', () => {
    expect(
      queued({
        agentId: 'agy',
        command: 'agy',
        prompt: 'Review this repository and ask before changing files',
        mode: 'headless',
      }),
    ).toBe("agy -p 'Review this repository and ask before changing files'");
  });

  it('appends the Return only when the caller asked for one', () => {
    expect(queued({ autoSend: true }).endsWith('\r')).toBe(true);
    expect(queued().endsWith('\r')).toBe(false);
  });

  it('omits prompt when none is provided (e.g. for resume)', () => {
    expect(queued({ prompt: undefined, extraArgs: ['--resume', 'abcd-1234'] })).toBe(
      'claude --resume abcd-1234',
    );
  });
});

describe('startAgent — Ollama binding resolution (Phase 96 Theme H)', () => {
  beforeEach(() => {
    useTerminalStore.setState({ sessions: [], activeId: null, states: {}, pendingInput: {} });
    useUiStore.setState({ agentBackends: {} });
  });

  it('a native (or absent) binding changes nothing about the composed words', () => {
    const session = startAgent({
      repoId: 'r1',
      cwd: '/repo',
      title: 'Patrol',
      prompt: 'hello',
      agentId: 'claude',
      command: 'claude',
      surface: 'fab',
    });
    expect(useTerminalStore.getState().pendingInput[session.id]).toBe("claude 'hello'");
    expect(session.backend).toBeUndefined();
    expect(session.ollamaModel).toBeUndefined();
  });

  it('an Ollama binding inserts the recipe args ahead of the prompt and stamps session identity', () => {
    useUiStore.setState({ agentBackends: { claude: { backend: 'ollama', model: 'qwen3:14b' } } });
    const session = startAgent({
      repoId: 'r1',
      cwd: '/repo',
      title: 'Patrol',
      prompt: 'hello',
      agentId: 'claude',
      command: 'claude',
      surface: 'fab',
    });
    expect(useTerminalStore.getState().pendingInput[session.id]).toBe(
      "claude --model qwen3:14b 'hello'",
    );
    expect(session.backend).toBe('ollama');
    expect(session.ollamaModel).toBe('qwen3:14b');
  });

  it('cline resolves through ollama launch, replacing the typed command', () => {
    useUiStore.setState({ agentBackends: { cline: { backend: 'ollama', model: 'qwen3:14b' } } });
    const session = startAgent({
      repoId: 'r1',
      cwd: '/repo',
      title: 'Patrol',
      prompt: 'hello',
      agentId: 'cline',
      command: 'cline',
      surface: 'fab',
    });
    expect(useTerminalStore.getState().pendingInput[session.id]).toBe(
      "ollama launch cline --model qwen3:14b --yes -- 'hello'",
    );
  });

  it('an Ollama binding with no model picked yet resolves as native', () => {
    useUiStore.setState({ agentBackends: { claude: { backend: 'ollama' } } });
    const session = startAgent({
      repoId: 'r1',
      cwd: '/repo',
      title: 'Patrol',
      prompt: 'hello',
      agentId: 'claude',
      command: 'claude',
      surface: 'fab',
    });
    expect(useTerminalStore.getState().pendingInput[session.id]).toBe("claude 'hello'");
    expect(session.backend).toBeUndefined();
  });
});

describe('startAgent — per-launch model override (Phase 96 Theme I)', () => {
  const base = {
    repoId: 'r1',
    cwd: '/repo',
    title: 'Patrol',
    prompt: 'hello',
    agentId: 'claude',
    command: 'claude',
    surface: 'fab' as const,
  };

  beforeEach(() => {
    useTerminalStore.setState({ sessions: [], activeId: null, states: {}, pendingInput: {} });
    useUiStore.setState({ agentBackends: {} });
  });

  it('an Ollama override wins over a native default, and drops the caller’s own --model', () => {
    const session = startAgent({
      ...base,
      extraArgs: ['--model', 'opus'],
      modelOverride: { backend: 'ollama', model: 'qwen3:14b' },
    });
    expect(useTerminalStore.getState().pendingInput[session.id]).toBe(
      "claude --model qwen3:14b 'hello'",
    );
    expect(session.ollamaModel).toBe('qwen3:14b');
  });

  it('an Ollama override wins over a different persisted Ollama model', () => {
    useUiStore.setState({ agentBackends: { claude: { backend: 'ollama', model: 'llama3' } } });
    const session = startAgent({ ...base, modelOverride: { backend: 'ollama', model: 'qwen3:14b' } });
    expect(useTerminalStore.getState().pendingInput[session.id]).toBe(
      "claude --model qwen3:14b 'hello'",
    );
  });

  it('a native override runs natively even when the default is Ollama, keeping the caller’s --model', () => {
    useUiStore.setState({ agentBackends: { claude: { backend: 'ollama', model: 'llama3' } } });
    const session = startAgent({
      ...base,
      extraArgs: ['--model', 'opus'],
      modelOverride: { backend: 'native' },
    });
    expect(useTerminalStore.getState().pendingInput[session.id]).toBe("claude --model opus 'hello'");
    expect(session.backend).toBeUndefined();
  });

  it('a persisted Ollama default never stacks a second --model from the caller', () => {
    useUiStore.setState({ agentBackends: { claude: { backend: 'ollama', model: 'llama3' } } });
    const session = startAgent({ ...base, extraArgs: ['--model', 'opus'] });
    expect(useTerminalStore.getState().pendingInput[session.id]).toBe("claude --model llama3 'hello'");
  });
});
