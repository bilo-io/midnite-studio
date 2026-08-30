import type { AgentDefinition } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  agentStatusWithin,
  buildProbeScript,
  parseProbeOutput,
  probeAgents,
  probeTarget,
  PROBE_TTL_MS,
  resetAgentProbeCache,
} from './agent-probe';

/**
 * The probe is tested against *captured* shell output rather than this
 * machine's PATH. That is the only way the interesting cases are reviewable at
 * all: an rc-file banner printing an absolute path, a shell that died halfway
 * through the batch, and an agent whose command exists but whose frame never
 * arrived are all things a real probe on a working laptop will never produce.
 */

const agent = (id: string, command = id): AgentDefinition => ({
  id,
  label: id,
  command,
  args: [],
  accent: '#ffffff',
});

const ROSTER = [agent('claude'), agent('agy'), agent('codex'), agent('openclaude')];

/** What one framed answer looks like coming back out of the shell. */
const frame = (id: string, body: string): string =>
  `\n__MGIT_AGENT_${id}_START__\n${body}\n__MGIT_AGENT_${id}_END__\n`;

describe('buildProbeScript', () => {
  it('resolves the whole roster in one command line', () => {
    const script = buildProbeScript(ROSTER);

    for (const a of ROSTER) expect(script).toContain(`command -v '${a.command}'`);
    // One shell, not four: the segments are joined, not separate invocations.
    expect(script.split('command -v')).toHaveLength(ROSTER.length + 1);
  });

  it('frames each answer so an interleaved banner cannot be misread as a path', () => {
    const script = buildProbeScript([agent('claude')]);

    expect(script).toContain('__MGIT_AGENT_claude_START__');
    expect(script).toContain('__MGIT_AGENT_claude_END__');
  });

  /**
   * A profile with `set -e` in it would end the batch on the first missing
   * binary, and every agent after that one would go unanswered — reported as
   * unknown rather than as the installed thing it is.
   */
  it('swallows a missing command so the batch survives it', () => {
    expect(buildProbeScript([agent('nope')])).toContain('|| true');
  });

  /**
   * Two independent defences, and the test asserts both. `probeTarget` keeps
   * only the first token, so the rest of a hostile `command` never reaches the
   * shell at all; and what remains is single-quoted, so a token that is itself
   * shell syntax is passed as a literal argument rather than executed.
   */
  it('cannot be made to compose a command line by a roster entry', () => {
    const script = buildProbeScript([agent('evil', 'x; rm -rf /')]);

    expect(script).toContain(`command -v 'x;'`);
    expect(script).not.toContain('rm -rf /');
    expect(script).not.toContain('command -v x;');
  });

  it("escapes a quote in a command rather than closing the shell's string", () => {
    const script = buildProbeScript([agent('q', "it's")]);

    expect(script).toContain(`command -v 'it'\\''s'`);
  });

  /**
   * The id goes into the frame markers, which are built by string concatenation
   * rather than quoting — so an id that is not a bare token is skipped outright
   * rather than trusted.
   */
  it('skips an agent whose id is not a shell-safe token', () => {
    const script = buildProbeScript([agent("bad'id"), agent('claude')]);

    expect(script).toContain('__MGIT_AGENT_claude_START__');
    expect(script).not.toContain('bad');
  });

  it('is empty for an empty roster', () => {
    expect(buildProbeScript([])).toBe('');
  });
});

describe('parseProbeOutput', () => {
  it('reads one path per agent out of the batch', () => {
    const output =
      frame('claude', '/Users/x/.local/bin/claude') +
      frame('agy', '/Users/x/.local/bin/agy') +
      frame('codex', '/opt/homebrew/bin/codex') +
      frame('openclaude', '');

    expect(parseProbeOutput(output, ROSTER)).toEqual([
      { id: 'claude', installed: true, resolvedPath: '/Users/x/.local/bin/claude' },
      { id: 'agy', installed: true, resolvedPath: '/Users/x/.local/bin/agy' },
      { id: 'codex', installed: true, resolvedPath: '/opt/homebrew/bin/codex' },
      { id: 'openclaude', installed: false, resolvedPath: null },
    ]);
  });

  /**
   * This is the case the frames exist for. Without them,
   * `parseWhichOutput`'s "last absolute-path line wins" rule would hand the
   * banner's path to whichever agent was parsed last — and on a machine whose
   * profile prints one, every agent would resolve to the same wrong binary.
   */
  it('is not fooled by an rc-file banner printing a path between frames', () => {
    const output =
      'Last login: Tue\n/usr/local/opt/nvm/nvm.sh sourced\n' +
      frame('claude', '/Users/x/.local/bin/claude') +
      'tool 1.2.3 update available: /usr/local/bin/tool\n' +
      frame('openclaude', '');

    expect(parseProbeOutput(output, [agent('claude'), agent('openclaude')])).toEqual([
      { id: 'claude', installed: true, resolvedPath: '/Users/x/.local/bin/claude' },
      { id: 'openclaude', installed: false, resolvedPath: null },
    ]);
  });

  /**
   * A shell killed on the timeout mid-batch. The agents it reached are known;
   * the ones it never got to are **omitted** rather than reported missing —
   * "we did not ask" and "it is not there" are different facts, and only one of
   * them may grey out a menu item.
   */
  it('omits an agent whose frame never arrived, rather than calling it missing', () => {
    const output = frame('claude', '/Users/x/.local/bin/claude') + '\n__MGIT_AGENT_agy_START__\n';

    expect(parseProbeOutput(output, ROSTER)).toEqual([
      { id: 'claude', installed: true, resolvedPath: '/Users/x/.local/bin/claude' },
    ]);
  });

  it('omits everything when the shell produced nothing at all', () => {
    expect(parseProbeOutput('', ROSTER)).toEqual([]);
  });

  /**
   * `command -v` prints the name unqualified for a shell function or builtin,
   * which is not a path the app can show — but it IS an install, and the pty
   * will run it. `installed` and `resolvedPath` part company here, which is why
   * the schema made the path nullable independently of the boolean.
   */
  it('reports a shell function as installed with no path', () => {
    const output = frame('claude', 'claude () {\n\tnode ~/cli.js\n}');

    expect(parseProbeOutput(output, [agent('claude')])).toEqual([
      { id: 'claude', installed: true, resolvedPath: null },
    ]);
  });

  it('keeps the roster order regardless of the order the frames arrived in', () => {
    const output = frame('codex', '/opt/homebrew/bin/codex') + frame('claude', '/bin/claude');

    expect(parseProbeOutput(output, ROSTER).map((s) => s.id)).toEqual(['claude', 'codex']);
  });
});

describe('probeTarget', () => {
  /**
   * A roster `command` is a command LINE — `agents-store.test.ts` documents
   * `claude --dangerously-skip-permissions` as a supported override, and the
   * renderer types the whole thing into a shell. `command -v` takes a NAME, so
   * handing it the line finds nothing and reports a working agent as missing:
   * the probe disagreeing with the launch about the one thing it exists to
   * predict.
   */
  it('takes the program name out of a command line with flags', () => {
    expect(probeTarget('claude --dangerously-skip-permissions')).toBe('claude');
    expect(probeTarget('  codex   --model o3  ')).toBe('codex');
  });

  it('leaves a bare command alone', () => {
    expect(probeTarget('agy')).toBe('agy');
  });
});

describe('parseProbeOutput — answers that are not paths', () => {
  /**
   * The whole reason the probe pays for a login shell is to see the installs
   * that are not files on the PATH. `command -v` answers with a bare name for a
   * shell function and `alias foo='…'` for an alias — neither starts with `/`,
   * and the pty will run both happily. Discarding them would make the extra
   * subprocess pointless AND grey out an agent that works.
   */
  it.each([
    ['a shell function', 'claude'],
    ['an alias', "alias claude='claude --verbose'"],
    ['a builtin', 'claude'],
  ])('counts %s as installed, with no path', (_name, answer) => {
    const output = frame('claude', answer);

    expect(parseProbeOutput(output, [agent('claude')])).toEqual([
      { id: 'claude', installed: true, resolvedPath: null },
    ]);
  });

  it('still calls an empty answer missing', () => {
    expect(parseProbeOutput(frame('claude', '   '), [agent('claude')])).toEqual([
      { id: 'claude', installed: false, resolvedPath: null },
    ]);
  });
});

/**
 * The cache is the part with no shell in it, so it is the part that can be
 * tested outright — `run` and `now` are both injected for exactly that reason.
 */
describe('probeAgents — cache, TTL and in-flight sharing', () => {
  beforeEach(() => resetAgentProbeCache());

  const found = (agents: readonly ReturnType<typeof agent>[]) =>
    agents.map((a) => frame(a.id, `/usr/local/bin/${a.command}`)).join('');

  const runner = (output: string, delayMs = 0) =>
    vi.fn(
      async () =>
        new Promise<{ output: string }>((r) => setTimeout(() => r({ output }), delayMs)),
    );

  it('runs one shell for the whole roster', async () => {
    const run = runner(found(ROSTER));
    await probeAgents(ROSTER, { run, now: () => 0 });

    expect(run).toHaveBeenCalledOnce();
  });

  it('serves a second call from the memo without another shell', async () => {
    const run = runner(found(ROSTER));
    await probeAgents(ROSTER, { run, now: () => 0 });
    await probeAgents(ROSTER, { run, now: () => PROBE_TTL_MS - 1 });

    expect(run).toHaveBeenCalledOnce();
  });

  it('re-probes once the TTL has passed', async () => {
    const run = runner(found(ROSTER));
    await probeAgents(ROSTER, { run, now: () => 0 });
    await probeAgents(ROSTER, { run, now: () => PROBE_TTL_MS });

    expect(run).toHaveBeenCalledTimes(2);
  });

  /**
   * Stamped when the shell ANSWERS, not when the caller asked. Otherwise a
   * probe that burns the full timeout lands already eight seconds old, and the
   * machine with the slow rc file — the one machine this cache exists for —
   * gets the SHORTEST cache lifetime rather than the longest.
   */
  it('dates the memo from the answer, not the request', async () => {
    const run = runner(found(ROSTER));
    let clock = 0;
    const now = (): number => clock;

    const probe = probeAgents(ROSTER, { run, now });
    clock = 8_000; // the shell took the full timeout to answer
    await probe;

    // 20s after the ANSWER is still inside a 30s TTL, though it is 28s after
    // the request that started it.
    clock = 28_000;
    await probeAgents(ROSTER, { run, now });
    expect(run).toHaveBeenCalledOnce();
  });

  it('shares one in-flight shell between concurrent callers', async () => {
    const run = runner(found(ROSTER), 5);
    const [a, b] = await Promise.all([
      probeAgents(ROSTER, { run, now: () => 0 }),
      probeAgents(ROSTER, { run, now: () => 0 }),
    ]);

    expect(run).toHaveBeenCalledOnce();
    expect(a).toEqual(b);
  });

  /**
   * …but only for the SAME roster. An `agents.json` edited while a probe is in
   * flight is exactly the moment the caller must not be handed the previous
   * roster's answer — and it is the caller that triggered ON the edit, so
   * "it self-corrects next time" is no comfort.
   */
  it('does not hand a changed roster the previous roster\'s probe', async () => {
    const grown = [...ROSTER, agent('gemini')];
    const run = vi
      .fn<(command: string, timeoutMs: number) => Promise<{ output: string }>>()
      .mockImplementationOnce(
        async () => new Promise((r) => setTimeout(() => r({ output: found(ROSTER) }), 5)),
      )
      .mockImplementationOnce(async () => ({ output: found(grown) }));

    const first = probeAgents(ROSTER, { run, now: () => 0 });
    const second = await probeAgents(grown, { run, now: () => 0 });
    await first;

    expect(run).toHaveBeenCalledTimes(2);
    expect(second.map((s) => s.id)).toContain('gemini');
  });

  it('is empty for an empty roster and never starts a shell', async () => {
    const run = runner('');
    expect(await probeAgents([], { run, now: () => 0 })).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });
});

describe('agentStatusWithin', () => {
  beforeEach(() => resetAgentProbeCache());

  it('returns the probe when it answers in time', async () => {
    const run = vi.fn(async () => ({ output: frame('claude', '/bin/claude') }));

    expect(await agentStatusWithin([agent('claude')], 500, { run, now: () => 0 })).toEqual([
      { id: 'claude', installed: true, resolvedPath: '/bin/claude' },
    ]);
  });

  /**
   * The roster is a file read that never needed a shell. Making the whole
   * response wait on one means the session list's marks stall behind an rc file
   * that sources nvm — for a fact whose only job is grey-out styling. Absent
   * status already means "assume installed", so shipping early is correct by
   * design.
   */
  it('ships an empty status rather than waiting on a slow shell', async () => {
    const run = vi.fn(
      async () =>
        new Promise<{ output: string }>((r) =>
          setTimeout(() => r({ output: frame('claude', '/bin/claude') }), 200),
        ),
    );

    expect(await agentStatusWithin([agent('claude')], 10, { run, now: () => 0 })).toEqual([]);
  });

  it('never rejects when the shell throws', async () => {
    const run = vi.fn(async () => {
      throw new Error('no shell');
    });

    expect(await agentStatusWithin([agent('claude')], 500, { run, now: () => 0 })).toEqual([]);
  });
});
