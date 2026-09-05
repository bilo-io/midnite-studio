import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BUILTIN_AGENTS, type AgentDefinition } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import {
  commandLabel,
  descendantsOf,
  foregroundOf,
  isOurProcess,
  matchAgentInArgv,
  matchRunningAgent,
  parsePsOutput,
  type ProcessRow,
} from './agent-process';

/**
 * Tested against captured `ps` output, never a live process tree.
 *
 * The forms that matter — a nested agent, two agents at the same depth, an
 * agent's name arriving as an *argument* — are precisely the ones a working
 * laptop will not produce on demand, and a test that reads the real process
 * table asserts whatever happened to be running when CI ran it. See
 * `__fixtures__/README.md` for where these command lines come from; every
 * fixture roots its pty shell at pid 60000.
 */

/** The pid every fixture uses for the pty's own login shell. */
const SHELL_PID = 60_000;

const fixture = (name: string): string =>
  readFileSync(join(__dirname, '__fixtures__', `${name}.txt`), 'utf8');

const rows = (name: string) => parsePsOutput(fixture(name));

/** The real roster, so a change to `BUILTIN_AGENTS` is felt here. */
const ROSTER = BUILTIN_AGENTS;

const agentOf = (name: string, rosterOverride?: readonly AgentDefinition[]): string | null =>
  matchRunningAgent(rows(name), SHELL_PID, rosterOverride ?? ROSTER);

describe('parsePsOutput', () => {
  it("reads the leading-space padding header-suppressed ps actually emits", () => {
    const parsed = parsePsOutput('    1     0 Ss  /sbin/launchd\n60000 59980 S+  /bin/zsh -l\n');

    expect(parsed).toEqual([
      { pid: 1, ppid: 0, stat: 'Ss', rssBytes: 0, cpuPercent: 0, args: '/sbin/launchd' },
      { pid: 60_000, ppid: 59_980, stat: 'S+', rssBytes: 0, cpuPercent: 0, args: '/bin/zsh -l' },
    ]);
  });

  it('parses the widened 6-column layout with RSS in bytes and CPU percent', () => {
    const parsed = parsePsOutput(
      '    1     0 Ss    19680   0.0 /sbin/launchd\n60000 59980 S+     1024  12.5 /bin/zsh -l\n',
    );

    expect(parsed).toEqual([
      { pid: 1, ppid: 0, stat: 'Ss', rssBytes: 19_680 * 1024, cpuPercent: 0.0, args: '/sbin/launchd' },
      { pid: 60_000, ppid: 59_980, stat: 'S+', rssBytes: 1_024 * 1024, cpuPercent: 12.5, args: '/bin/zsh -l' },
    ]);
  });

  it('keeps the spaces inside a command line, splitting only the leading columns', () => {
    const [row] = parsePsOutput('60072 60000 S+  2048  1.5  node /opt/homebrew/bin/codex --model gpt-5');

    expect(row?.args).toBe('node /opt/homebrew/bin/codex --model gpt-5');
    expect(row?.rssBytes).toBe(2048 * 1024);
    expect(row?.cpuPercent).toBe(1.5);
  });

  /**
   * A wrapped argv or a stray banner has no pid of its own. Guessing one would
   * attach a real command line to the wrong parent, which is how a plain shell
   * ends up wearing an agent's mark.
   */
  it('skips a line that does not start with two integers', () => {
    expect(parsePsOutput('not a process row\n  60000 59980 S+  /bin/zsh\n')).toHaveLength(1);
  });

  it('skips continuation lines when an argv contains a newline', () => {
    const raw = '60000 59980 S+  1024  0.0  sh -c echo "hello\nworld"\n60001 60000 S+  512  0.0  grep foo\n';
    const parsed = parsePsOutput(raw);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.pid).toBe(60000);
    expect(parsed[1]?.pid).toBe(60001);
  });

  it('skips a row with a pid but no command line at all', () => {
    expect(parsePsOutput('60000 59980 S+     \n')).toEqual([]);
  });

  /**
   * Lines with missing STAT are rejected rather than guessed.
   */
  it('rejects rows without required status column', () => {
    expect(parsePsOutput('60000 59980 /bin/zsh\n')).toEqual([]);
  });
});

describe('descendantsOf', () => {
  it('finds nothing below a pid with no children', () => {
    expect(descendantsOf(rows('ps-bare-agent'), 99_999)).toEqual([]);
  });

  it('carries the depth of each descendant, breadth-first', () => {
    const found = descendantsOf(rows('ps-nested-agents'), SHELL_PID);

    expect(found.map((d) => [d.row.pid, d.depth])).toEqual([
      [60_130, 1],
      [60_131, 2],
      [60_132, 3],
    ]);
  });

  /**
   * The exact case `workbench-store.test.ts` guards elsewhere, in process form:
   * two sibling trees under the same app must not collapse into each other. A
   * second terminal's `claude` belongs to the second terminal.
   */
  it("does not reach into a sibling shell's tree", () => {
    expect(descendantsOf(rows('ps-other-session'), SHELL_PID)).toEqual([]);
  });

  /**
   * `kernel_task` reports `ppid: 0` and its own pid is 0. Treating it as its own
   * child would loop the walk forever, and it is in every single listing.
   */
  it('survives a row that is its own parent', () => {
    const found = descendantsOf(rows('ps-reparented'), 0);

    // Terminates at all, and never lists pid 0 among its own descendants.
    expect(found.some((d) => d.row.pid === 0)).toBe(false);
    // pid 1 genuinely is a child of pid 0, so the walk does find launchd.
    expect(found.map((d) => d.row.pid)).toContain(1);
  });

  /**
   * A process whose parent exited and was reaped is reparented to pid 1 on
   * darwin. It is no longer below the pty, and reporting it would keep an
   * agent's mark on a session whose shell has nothing to do with it any more.
   */
  it("drops a descendant that has been reparented away from the pty", () => {
    expect(descendantsOf(rows('ps-reparented'), SHELL_PID)).toEqual([]);
  });
});

describe('matchAgentInArgv', () => {
  it('matches a bare compiled binary — the form claude and agy actually take', () => {
    expect(matchAgentInArgv('claude', ROSTER)).toBe('claude');
    expect(matchAgentInArgv('agy', ROSTER)).toBe('agy');
  });

  it('matches an absolute path to the command', () => {
    expect(matchAgentInArgv('/opt/homebrew/bin/codex', ROSTER)).toBe('codex');
  });

  it("matches a shebang script through its runtime, which is how codex appears", () => {
    expect(matchAgentInArgv('node /opt/homebrew/bin/codex', ROSTER)).toBe('codex');
  });

  it("looks past the runtime's own flags to find the script", () => {
    expect(
      matchAgentInArgv('node --enable-source-maps --max-old-space-size=4096 /opt/homebrew/bin/codex', ROSTER),
    ).toBe('codex');
  });

  it('matches a package directory when the entry file is named after nothing', () => {
    expect(
      matchAgentInArgv('node /Users/me/.nvm/lib/node_modules/codex/bin/index.js --model gpt-5', ROSTER),
    ).toBe('codex');
  });

  it('matches a version-suffixed runtime', () => {
    expect(matchAgentInArgv('node22 /opt/homebrew/bin/codex', ROSTER)).toBe('codex');
  });

  /**
   * The whole reason the matcher never scans arguments. Each of these is a plain
   * shell doing something ordinary, and a scan-everything rule would have put an
   * agent's mark on all four.
   */
  it.each([
    ['a commit message', "git commit -m try codex instead"],
    ['a filename', 'vim codex.md'],
    ['a grep pattern', 'grep -rn claude packages/app/src'],
    ['an unrelated helper from a similarly-named app', '/Applications/Claude.app/Contents/Helpers/chrome-native-host'],
  ])('does not match an agent named as %s', (_label, args) => {
    expect(matchAgentInArgv(args, ROSTER)).toBeNull();
  });

  /**
   * `claude-code` is not `claude`. Segment matching is exact, so the npm package
   * layout goes unmatched rather than guessed at — the documented, deliberate
   * limit of rule 3, and the posture the phase asks for: no mark beats a wrong
   * one.
   *
   * This answer is load-bearing downstream, not merely tolerated: because the
   * matcher will not guess here, `agent-watcher.ts` refuses to let a `null` take
   * away a mark no probe has ever *seen*. Otherwise this `null` would strip
   * Claude's mark off a session where Claude Code is genuinely running.
   */
  it('leaves a path segment that merely resembles a command unmatched', () => {
    expect(
      matchAgentInArgv('node /Users/me/.local/share/@anthropic-ai/claude-code/cli.js', ROSTER),
    ).toBeNull();
  });

  /**
   * Rule 3 walks outwards from the entry file, not inwards from the root. A
   * checkout named after one agent that holds another agent's script must report
   * the script's agent — the segments nearest the file say what is running, the
   * ones further out say where it lives.
   */
  it('prefers the segment nearest the script over an outer directory', () => {
    expect(
      matchAgentInArgv('node /Users/me/codex/node_modules/claude/bin/cli.js', ROSTER),
    ).toBe('claude');
  });

  /**
   * The never-scan-arguments rule, sneaking back in through script detection.
   * `--require` and friends take a *separate* path, and taking the first
   * non-flag token finds that path rather than the program.
   */
  it.each([
    ['--require', 'node --require /opt/codex/preload.js /opt/tools/run.js'],
    ['-r', 'node -r /opt/codex/preload.js /opt/tools/run.js'],
    ['--import', 'node --import /opt/agy/hook.mjs /opt/tools/run.js'],
    ['--env-file', 'node --env-file /etc/codex/.env /opt/tools/run.js'],
  ])("does not mistake %s's own path argument for the script", (_flag, args) => {
    expect(matchAgentInArgv(args, ROSTER)).toBeNull();
  });

  it('still finds the script after a flag whose value it skipped', () => {
    expect(
      matchAgentInArgv('node --require /opt/x/preload.js /opt/homebrew/bin/codex', ROSTER),
    ).toBe('codex');
  });

  it('handles an inline --flag=value without skipping the script', () => {
    expect(
      matchAgentInArgv('node --env-file=/etc/x/.env /opt/homebrew/bin/codex', ROSTER),
    ).toBe('codex');
  });

  it('does not treat a non-runtime argv[0] as a wrapper', () => {
    // `git` is not a runtime, so its arguments are never inspected.
    expect(matchAgentInArgv('git /opt/homebrew/bin/codex', ROSTER)).toBeNull();
  });

  it('returns null for a runtime with nothing but flags after it', () => {
    expect(matchAgentInArgv('node --version', ROSTER)).toBeNull();
  });

  it('returns null for an empty command line', () => {
    expect(matchAgentInArgv('   ', ROSTER)).toBeNull();
  });

  /**
   * A roster `command` is a command LINE — `agents-store.test.ts` documents
   * `claude --dangerously-skip-permissions` as a supported override — so the
   * matcher has to reduce one to a program name the same way the install probe
   * does, or the two disagree about the same entry.
   */
  it("matches an agent whose roster command carries its own flags", () => {
    const custom: AgentDefinition[] = [
      { id: 'claude', label: 'Claude', command: 'claude --dangerously-skip-permissions', args: [], accent: '#000' },
    ];

    expect(matchAgentInArgv('claude', custom)).toBe('claude');
  });

  it('resolves a shared basename to the first roster entry, not the last', () => {
    const clashing: AgentDefinition[] = [
      { id: 'first', label: 'First', command: '/opt/a/tool', args: [], accent: '#000' },
      { id: 'second', label: 'Second', command: '/opt/b/tool', args: [], accent: '#000' },
    ];

    expect(matchAgentInArgv('tool', clashing)).toBe('first');
  });
});

describe('matchRunningAgent', () => {
  it('finds nothing in a shell sitting at a prompt', () => {
    expect(agentOf('ps-plain-shell')).toBeNull();
  });

  it("names the agent a session's shell is running", () => {
    expect(agentOf('ps-bare-agent')).toBe('claude');
  });

  it('names an agent reached through its runtime', () => {
    expect(agentOf('ps-node-wrapper')).toBe('codex');
    expect(agentOf('ps-package-layout')).toBe('codex');
    expect(agentOf('ps-runtime-flags')).toBe('codex');
  });

  it('finds nothing when every mention of an agent is an argument', () => {
    expect(agentOf('ps-agent-as-argument')).toBeNull();
  });

  /**
   * Deepest wins: the innermost recognised process is the one the user is
   * talking to, and an agent that shelled out to another is a launcher by then.
   */
  it('prefers the innermost agent when one is running inside another', () => {
    expect(agentOf('ps-nested-agents')).toBe('codex');
  });

  /**
   * Two *different* agents at the same depth: nothing in the process table says
   * which of them owns the screen, so there is no confident answer to give.
   */
  it('gives no answer when two different agents sit at the same depth', () => {
    expect(agentOf('ps-ambiguous')).toBeNull();
  });

  /**
   * The same agent twice at the same depth is not a tie — it is one answer
   * arrived at twice, which is what an agent that forks a worker looks like.
   */
  it('is not confused by an agent that forked a copy of itself', () => {
    expect(agentOf('ps-forked-worker')).toBe('claude');
  });

  it("ignores an agent running under a different terminal's shell", () => {
    expect(agentOf('ps-other-session')).toBeNull();
  });

  it('finds nothing when the roster is empty', () => {
    expect(agentOf('ps-bare-agent', [])).toBeNull();
  });
});

describe('foregroundOf', () => {
  it('names the single foreground process under the pty', () => {
    const fg = foregroundOf(rows('ps-foreground-single'), SHELL_PID);
    expect(fg?.args).toBe('pnpm dev');
  });

  /**
   * A shell forks a pipeline's members left to right, so the highest pid is
   * the rightmost command — `less`, in `git log | less`, which is what the
   * user is actually looking at.
   */
  it('names the last member of a pipeline by pid, not the first', () => {
    const fg = foregroundOf(rows('ps-foreground-pipeline'), SHELL_PID);
    expect(fg?.args).toBe('less');
  });

  it('is null at a bare prompt, with nothing else in the tree', () => {
    expect(foregroundOf(rows('ps-bare-prompt'), SHELL_PID)).toBeNull();
  });

  it('is null for a background job with no + in its STAT', () => {
    expect(foregroundOf(rows('ps-background-job'), SHELL_PID)).toBeNull();
  });
});

describe('commandLabel', () => {
  it('reduces argv[0] to its basename and keeps the rest', () => {
    expect(commandLabel('/usr/local/bin/pnpm dev')).toBe('pnpm dev');
  });

  it('passes a bare command through unchanged', () => {
    expect(commandLabel('less')).toBe('less');
  });

  it('truncates a long line to 40 characters ending in an ellipsis', () => {
    const label = commandLabel(`/usr/bin/git ${'a'.repeat(60)}`);
    expect(label).toHaveLength(40);
    expect(label.endsWith('…')).toBe(true);
  });
});

describe('isOurProcess', () => {
  const sampleRows: ProcessRow[] = [
    { pid: 1000, ppid: 1, stat: 'S', rssBytes: 1024, cpuPercent: 0, args: 'midnite-studio' },
    { pid: 1001, ppid: 1000, stat: 'S', rssBytes: 1024, cpuPercent: 0, args: 'electron-helper' },
    { pid: 2000, ppid: 1, stat: 'S', rssBytes: 1024, cpuPercent: 0, args: 'zsh' },
    { pid: 2001, ppid: 2000, stat: 'S+', rssBytes: 1024, cpuPercent: 0, args: 'claude' },
    { pid: 3000, ppid: 1, stat: 'S', rssBytes: 1024, cpuPercent: 0, args: 'unrelated' },
  ];

  it('identifies midnite process itself as ours', () => {
    expect(isOurProcess(1000, sampleRows, [2000], 1000)).toBe(true);
  });

  it('identifies midnite child helper as ours', () => {
    expect(isOurProcess(1001, sampleRows, [2000], 1000)).toBe(true);
  });

  it('identifies pty root pid as ours', () => {
    expect(isOurProcess(2000, sampleRows, [2000], 1000)).toBe(true);
  });

  it('identifies pty descendant as ours', () => {
    expect(isOurProcess(2001, sampleRows, [2000], 1000)).toBe(true);
  });

  it('rejects unrelated process not spawned by midnite or ptys', () => {
    expect(isOurProcess(3000, sampleRows, [2000], 1000)).toBe(false);
  });
});
