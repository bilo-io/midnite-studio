import {
  BUILTIN_AGENTS,
  COMPANION_ASK_FALLBACK,
  emptyCompanionSnapshot,
  type AgentDefinition,
  type CompanionVocabulary,
} from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import type { SpawnedProcess, SpawnFn } from '../process-runner';
import {
  askCompanion,
  buildAskPrompt,
  resolveHeadlessAgent,
  COMPANION_ASK_RAW_CAP,
  type CompanionAskDeps,
} from './ask';

/**
 * A fake `spawn` that answers with fixed output — Phase 79 Theme E.
 *
 * Modelled on nothing in particular because `process-runner.ts` was written
 * with exactly this seam in mind (`SpawnFn` is injected for it). What the fake
 * has to get right is the *timing*: `runProcess` attaches its handlers after
 * `spawn` returns, so a fake that fires them synchronously fires them into
 * nothing. Hence the `queueMicrotask`.
 */
function fakeSpawn(options: {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  /** Never closes — for the timeout path. */
  hang?: boolean;
  /** Fails to spawn at all, as a missing binary does. */
  enoent?: boolean;
  onArgs?: (command: string, args: readonly string[], cwd: string) => void;
}): SpawnFn {
  return (command, args, cwd) => {
    options.onArgs?.(command, args, cwd);
    const handlers: {
      stdout?: (chunk: string) => void;
      stderr?: (chunk: string) => void;
      error?: (error: NodeJS.ErrnoException) => void;
      close?: (code: number | null) => void;
    } = {};
    const child: SpawnedProcess = {
      onStdout: (handler) => {
        handlers.stdout = handler;
      },
      onStderr: (handler) => {
        handlers.stderr = handler;
      },
      onError: (handler) => {
        handlers.error = handler;
      },
      onClose: (handler) => {
        handlers.close = handler;
      },
      /*
        Deferred, like a real `SIGKILL`: `runProcess`'s deadline calls `kill()`
        and *then* settles as `timed-out`, so a fake that closes synchronously
        settles the promise as a SUCCESS from inside the timer and the timeout
        arm is never reached. That is not a hypothetical — it is what this test
        did before the microtask.
      */
      kill: () => queueMicrotask(() => handlers.close?.(null)),
    };
    queueMicrotask(() => {
      if (options.enoent) {
        const error: NodeJS.ErrnoException = new Error('spawn claude ENOENT');
        error.code = 'ENOENT';
        handlers.error?.(error);
        return;
      }
      if (options.hang) return;
      if (options.stdout !== undefined) handlers.stdout?.(options.stdout);
      if (options.stderr !== undefined) handlers.stderr?.(options.stderr);
      handlers.close?.(options.exitCode ?? 0);
    });
    return child;
  };
}

const claude = BUILTIN_AGENTS.find((agent) => agent.id === 'claude') as AgentDefinition;
const cursor = BUILTIN_AGENTS.find((agent) => agent.id === 'cursor') as AgentDefinition;

const deps = (over: Partial<CompanionAskDeps> = {}): CompanionAskDeps => ({
  agents: async () => [claude],
  home: () => '/home/tester',
  ...over,
});

describe('resolveHeadlessAgent', () => {
  it('prefers the id the renderer asked for', () => {
    const resolved = resolveHeadlessAgent([cursor, claude], 'claude');
    expect(resolved?.agent.id).toBe('claude');
    expect(resolved?.args).toEqual(['-p']);
  });

  it('falls through to anything with a print mode when the preferred agent has none', () => {
    // Cursor is on the roster and is the user's primary, but has no known
    // print mode: refusing to think at all would be worse than quietly using
    // the Claude CLI sitting right beside it.
    expect(resolveHeadlessAgent([cursor, claude], 'cursor')?.agent.id).toBe('claude');
  });

  it('returns null when nothing on the roster can run headlessly', () => {
    expect(resolveHeadlessAgent([cursor], 'cursor')).toBeNull();
    expect(resolveHeadlessAgent([], undefined)).toBeNull();
  });
});

describe('buildAskPrompt', () => {
  it('asks the router for JSON and hands it the closed id list', () => {
    const prompt = buildAskPrompt({ kind: 'route', text: 'do the thing', repoPath: null });
    expect(prompt).toContain('ONE JSON object and nothing else');
    expect(prompt).toContain('execSwarm');
    expect(prompt).toContain('never guess an id that is not listed');
  });

  it('asks the summariser for speech, not markdown', () => {
    const prompt = buildAskPrompt({ kind: 'summarise', text: 'lots of output', repoPath: null });
    expect(prompt).toContain('2 to 4 plain sentences');
    expect(prompt).toContain('speech synthesiser');
  });

  it('inlines the snapshot it was given rather than rebuilding one', () => {
    const prompt = buildAskPrompt({
      kind: 'route',
      text: 'x',
      repoPath: '/repos/studio',
      snapshot: { ...emptyCompanionSnapshot(2), branch: 'feature/thing' },
    });
    expect(prompt).toContain('"branch":"feature/thing"');
  });

  it('says so plainly when there is no snapshot', () => {
    expect(buildAskPrompt({ kind: 'route', text: 'x', repoPath: null })).toContain(
      'No repository is open.',
    );
  });

  it('caps a huge input by keeping its tail — the conclusion is at the end', () => {
    const text = `${'a'.repeat(20_000)}THE-CONCLUSION`;
    const prompt = buildAskPrompt({ kind: 'summarise', text, repoPath: null });
    expect(prompt).toContain('THE-CONCLUSION');
    expect(prompt.length).toBeLessThan(10_000);
  });

  /**
   * Settings ▸ Companion ▸ Personality's two free-text fields (Ad Hoc). The
   * empty case is the default and the one most likely to regress — a
   * dangling "About the user:" header with nothing under it — so it gets its
   * own assertion on both `kind`s, not just an absence check on one.
   */
  describe('the personality/about-me fields', () => {
    it('adds neither line when both are unset — the prompt reads exactly as it did before', () => {
      const withNeither = buildAskPrompt({ kind: 'route', text: 'x', repoPath: null });
      const withUndefined = buildAskPrompt({
        kind: 'route',
        text: 'x',
        repoPath: null,
        personality: undefined,
        aboutUser: undefined,
      });
      expect(withUndefined).toBe(withNeither);
      expect(withNeither).not.toContain('personality');
      expect(withNeither).not.toContain('About the user');
    });

    it('adds neither line when both are empty strings — same as unset, not a blank header', () => {
      const prompt = buildAskPrompt({
        kind: 'summarise',
        text: 'x',
        repoPath: null,
        personality: '',
        aboutUser: '   ',
      });
      expect(prompt).not.toContain("companion's personality");
      expect(prompt).not.toContain('About the user:');
    });

    it('adds only the personality line when only personality is set', () => {
      const prompt = buildAskPrompt({
        kind: 'route',
        text: 'x',
        repoPath: null,
        personality: 'Dry, terse, never uses an exclamation point.',
      });
      expect(prompt).toContain(
        "The companion's personality: Dry, terse, never uses an exclamation point.",
      );
      expect(prompt).not.toContain('About the user:');
    });

    it('adds only the about-user line when only aboutUser is set', () => {
      const prompt = buildAskPrompt({
        kind: 'summarise',
        text: 'x',
        repoPath: null,
        aboutUser: 'A backend engineer who prefers terse answers.',
      });
      expect(prompt).toContain('About the user: A backend engineer who prefers terse answers.');
      expect(prompt).not.toContain("companion's personality");
    });

    it('adds both lines, trimmed, when both are set — on both kinds', () => {
      for (const kind of ['route', 'summarise'] as const) {
        const prompt = buildAskPrompt({
          kind,
          text: 'x',
          repoPath: null,
          personality: '  Chatty and upbeat.  ',
          aboutUser: '  Works late, hates long answers.  ',
        });
        expect(prompt).toContain("The companion's personality: Chatty and upbeat.");
        expect(prompt).toContain('About the user: Works late, hates long answers.');
      }
    });
  });

  /**
   * Phase 81 Theme E — the `route` prompt learns views, settings pages,
   * commands (by tier) and skills from the vocabulary the renderer sends.
   */
  describe('the vocabulary', () => {
    const vocabulary: CompanionVocabulary = {
      views: [
        { id: 'graph', label: 'Commit Graph', keywords: 'graph history commits' },
        { id: 'database', label: 'Database Explorer', keywords: 'database db sql' },
      ],
      settingsPages: [
        { id: 'companion', label: 'Companion' },
        { id: 'mcp', label: 'MCP' },
      ],
      commands: [
        { id: 'sync.push', label: 'Push', group: 'sync', access: 'confirm' },
        { id: 'sync.fetch', label: 'Fetch', group: 'sync', access: 'direct' },
      ],
      skills: [
        { id: 'execAdhoc', label: 'Ad Hoc Task', hint: 'A one-off task.' },
        { id: 'gitReport', label: 'Git Report', hint: 'Activity report over a day/week/month.' },
      ],
      repos: ['midnite-studio', 'bilo-mono'],
    };

    it('reads exactly as it did before this field existed when the vocabulary is absent', () => {
      const withNone = buildAskPrompt({ kind: 'route', text: 'x', repoPath: null });
      const withUndefined = buildAskPrompt({
        kind: 'route',
        text: 'x',
        repoPath: null,
        vocabulary: undefined,
      });
      expect(withUndefined).toBe(withNone);
      expect(withNone).not.toContain('Views, as');
    });

    it('never touches the summarise prompt', () => {
      const withNone = buildAskPrompt({ kind: 'summarise', text: 'x', repoPath: null });
      const withVocab = buildAskPrompt({
        kind: 'summarise',
        text: 'x',
        repoPath: null,
        vocabulary,
      });
      expect(withVocab).toBe(withNone);
    });

    it('names every view id and every skill id exactly once', () => {
      const prompt = buildAskPrompt({ kind: 'route', text: 'x', repoPath: null, vocabulary });
      for (const view of vocabulary.views) {
        const needle = `${view.id} — ${view.label}`;
        expect(prompt.split(needle).length - 1).toBe(1);
      }
      for (const skill of vocabulary.skills) {
        const needle = `${skill.id} — ${skill.label}`;
        expect(prompt.split(needle).length - 1).toBe(1);
      }
    });

    it('names settings pages and commands with their tier, and the open repos', () => {
      const prompt = buildAskPrompt({ kind: 'route', text: 'x', repoPath: null, vocabulary });
      expect(prompt).toContain('settings:companion — Companion');
      expect(prompt).toContain('settings:mcp — MCP');
      expect(prompt).toContain('sync.push — Push [confirm]');
      expect(prompt).toContain('sync.fetch — Fetch [direct]');
      expect(prompt).toContain('Open repositories: midnite-studio, bilo-mono.');
    });

    it('carries one example each of navigate/run/confirm/help, and the unchanged refusal line', () => {
      const prompt = buildAskPrompt({ kind: 'route', text: 'x', repoPath: null, vocabulary });
      expect(prompt).toContain('{"kind":"navigate"');
      expect(prompt).toContain('{"kind":"run","id":"<a command id above>"}');
      expect(prompt).toContain('{"kind":"confirm"}');
      expect(prompt).toContain('{"kind":"help"}');
      // Verbatim — Theme A's own instruction, which now covers all five
      // lists by context rather than by being reworded.
      expect(prompt).toContain('never guess an id that is not listed');
    });

    it('never lists a never-tier command, because the vocabulary never carries one', () => {
      const prompt = buildAskPrompt({ kind: 'route', text: 'x', repoPath: null, vocabulary });
      expect(prompt).not.toContain('companion.toggle');
      expect(prompt).not.toContain('browser.clearData');
      expect(prompt).not.toContain('view.graph');
    });

    it('stays under 6 KB even with a full vocabulary', () => {
      const full: CompanionVocabulary = {
        views: Array.from({ length: 20 }, (_, i) => ({
          id: `view-${i}` as CompanionVocabulary['views'][number]['id'],
          label: `View ${i}`,
          keywords: `keyword-${i} alt-${i}`,
        })),
        settingsPages: Array.from({ length: 23 }, (_, i) => ({
          id: `page-${i}` as CompanionVocabulary['settingsPages'][number]['id'],
          label: `Page ${i}`,
        })),
        commands: Array.from({ length: 45 }, (_, i) => ({
          id: `cmd.${i}`,
          label: `Command ${i}`,
          group: 'view',
          access: i % 2 === 0 ? ('direct' as const) : ('confirm' as const),
        })),
        skills: Array.from({ length: 12 }, (_, i) => ({
          id: `skill-${i}` as CompanionVocabulary['skills'][number]['id'],
          label: `Skill ${i}`,
          hint: `Does thing ${i}.`,
        })),
        repos: ['midnite-studio'],
      };
      const prompt = buildAskPrompt({ kind: 'route', text: 'x', repoPath: null, vocabulary: full });
      expect(prompt.length).toBeLessThan(6000);
    });
  });
});

describe('askCompanion', () => {
  it('runs the CLI in print mode with the prompt as one argument', async () => {
    const onArgs = vi.fn();
    const result = await askCompanion(
      { kind: 'route', text: 'start a swarm', repoPath: '/repos/studio' },
      deps({ spawn: fakeSpawn({ stdout: '{"say":"Running it."}', onArgs }) }),
    );

    expect(result.ok).toBe(true);
    expect(onArgs).toHaveBeenCalledWith('claude', ['-p', expect.any(String)], '/repos/studio');
    // One argument, not a shell string — the prompt contains quotes and braces.
    expect(onArgs.mock.calls[0]?.[1]).toHaveLength(2);
  });

  it('runs in the home directory when no repo is open', async () => {
    const onArgs = vi.fn();
    await askCompanion(
      { kind: 'route', text: 'hello', repoPath: null },
      deps({ spawn: fakeSpawn({ stdout: '{"say":"Hi."}', onArgs }) }),
    );
    expect(onArgs.mock.calls[0]?.[2]).toBe('/home/tester');
  });

  it('returns the parsed reply, intent and all', async () => {
    const result = await askCompanion(
      { kind: 'route', text: 'start a swarm on the parser', repoPath: null },
      deps({
        spawn: fakeSpawn({
          stdout:
            'Sure:\n```json\n{"say":"Starting a swarm.","intent":{"kind":"command","id":"execSwarm","body":"the parser"}}\n```',
        }),
      }),
    );

    expect(result).toEqual({
      ok: true,
      value: {
        say: 'Starting a swarm.',
        intent: { kind: 'command', id: 'execSwarm', body: 'the parser' },
      },
    });
  });

  it('treats garbage as a SUCCESS carrying the fallback line and the raw text', async () => {
    // Deliberately not a failure: the raw output is the only evidence of what
    // went wrong, and a failure envelope would throw it away.
    const result = await askCompanion(
      { kind: 'route', text: 'x', repoPath: null },
      deps({ spawn: fakeSpawn({ stdout: 'I am afraid I cannot do that, Dave.' }) }),
    );

    expect(result).toEqual({
      ok: true,
      value: { say: COMPANION_ASK_FALLBACK, raw: 'I am afraid I cannot do that, Dave.' },
    });
  });

  it('caps the raw text it puts in the thread', async () => {
    const result = await askCompanion(
      { kind: 'route', text: 'x', repoPath: null },
      deps({ spawn: fakeSpawn({ stdout: 'z'.repeat(50_000) }) }),
    );
    expect(result.ok && result.value.raw).toHaveLength(COMPANION_ASK_RAW_CAP);
  });

  it('refuses an intent the CLI invented, rather than starting the wrong agent', async () => {
    const result = await askCompanion(
      { kind: 'route', text: 'x', repoPath: null },
      deps({
        spawn: fakeSpawn({
          stdout: '{"say":"Doing it.","intent":{"kind":"command","id":"releaseComplete"}}',
        }),
      }),
    );
    // The whole reply is rejected — `say` without a valid `intent` would be a
    // spoken confirmation of something that never ran.
    expect(result.ok && result.value.say).toBe(COMPANION_ASK_FALLBACK);
  });

  it('answers an envelope, not a rejection, when no CLI is installed', async () => {
    const result = await askCompanion(
      { kind: 'route', text: 'x', repoPath: null },
      deps({ spawn: fakeSpawn({ enoent: true }) }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.kind).toBe('error');
    expect(result.ok === false && result.kind === 'error' && result.message).toContain('Claude');
  });

  it('answers an envelope when the roster has nothing headless at all', async () => {
    const result = await askCompanion(
      { kind: 'route', text: 'x', repoPath: null },
      deps({ agents: async () => [cursor] }),
    );
    expect(result.ok === false && result.kind === 'error' && result.message).toContain(
      'No agent CLI with a headless mode is installed',
    );
  });

  it('gives up on a wedged CLI and says so', async () => {
    const result = await askCompanion(
      { kind: 'route', text: 'x', repoPath: null },
      deps({ spawn: fakeSpawn({ hang: true }), timeoutMs: 5 }),
    );
    expect(result.ok === false && result.kind === 'error' && result.message).toBe(
      'That took too long, so I stopped waiting.',
    );
  });

  it('never throws, whatever the CLI does', async () => {
    await expect(
      askCompanion(
        { kind: 'summarise', text: 'x', repoPath: null },
        deps({ spawn: fakeSpawn({ stdout: '', exitCode: 137 }) }),
      ),
    ).resolves.toMatchObject({ ok: true });
  });
});
