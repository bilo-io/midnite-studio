import { describe, expect, it } from 'vitest';

import {
  METRICS_ACTIVE_INTERVAL_MS,
  METRICS_IDLE_INTERVAL_MS,
  metricsPresent,
} from '../domain/metrics';
import { COMMAND_IDS, DEFAULT_KEYMAP, GLOBAL_CHORDS, isCommandId } from '../keybindings';
import { CHANNELS, EVENT_CHANNELS } from './channels';
import * as schemas from './schemas';

describe('channels', () => {
  it('has no duplicate channel names', () => {
    // A duplicate is a silent cross-wiring: two handlers registered on one name
    // and whichever registered last wins.
    const all = [...Object.values(CHANNELS), ...Object.values(EVENT_CHANNELS)];
    expect(new Set(all).size).toBe(all.length);
  });

  it('namespaces every channel under mgit:', () => {
    for (const name of [...Object.values(CHANNELS), ...Object.values(EVENT_CHANNELS)]) {
      expect(name.startsWith('mgit:')).toBe(true);
    }
  });
});

describe('request schemas', () => {
  it('applies the log stream defaults', () => {
    const parsed = schemas.LogStartRequest.parse({ repoId: 'r', requestId: 'q1' });
    expect(parsed.limit).toBe(50_000);
  });

  it('rejects an empty repoId', () => {
    expect(() => schemas.StatusGetRequest.parse({ repoId: '' })).toThrow();
  });

  it('requires at least one path to stage', () => {
    expect(() => schemas.StageRequest.parse({ repoId: 'r', paths: [] })).toThrow();
  });

  it('requires at least one sha to cherry-pick', () => {
    expect(() => schemas.CherryPickRequest.parse({ repoId: 'r', shas: [] })).toThrow();
  });

  it('constrains reset to the three real modes', () => {
    expect(schemas.ResetRequest.parse({ repoId: 'r', target: 'HEAD~1', mode: 'hard' }).mode).toBe(
      'hard',
    );
    expect(() =>
      schemas.ResetRequest.parse({ repoId: 'r', target: 'HEAD~1', mode: 'keep' }),
    ).toThrow();
  });

  it('has no force flag on push', () => {
    // No force-push exists anywhere in the MVP (INITIAL_PLAN → Risks). If this
    // ever fails, someone added one without the --force-with-lease gating.
    const parsed = schemas.PushRequest.parse({ repoId: 'r' });
    expect(parsed).not.toHaveProperty('force');
    expect(Object.keys(schemas.PushRequest.shape)).not.toContain('force');
  });

  it('defaults both diff requests to git\'s own -U3', () => {
    expect(schemas.FileDiffRequest.parse({ repoId: 'r', path: 'a.ts' }).context).toBe(3);
    expect(
      schemas.CommitFileDiffRequest.parse({ repoId: 'r', sha: 'abc', path: 'a.ts' }).context,
    ).toBe(3);
  });

  it('bounds the diff context a renderer can ask for', () => {
    // `context` becomes a `-U` argument, so an unbounded value from the renderer
    // is an unbounded amount of work in main.
    expect(() =>
      schemas.FileDiffRequest.parse({ repoId: 'r', path: 'a.ts', context: 10 ** 9 }),
    ).toThrow();
    expect(() =>
      schemas.FileDiffRequest.parse({ repoId: 'r', path: 'a.ts', context: -1 }),
    ).toThrow();
  });

  it('keeps the commit diff request scoped to a sha, not to the index', () => {
    // Widening FileDiffRequest with a sha would leave `staged` conditionally
    // meaningful on it. Two requests, each with only fields that always apply.
    expect(Object.keys(schemas.CommitFileDiffRequest.shape)).not.toContain('staged');
    expect(() => schemas.CommitFileDiffRequest.parse({ repoId: 'r', path: 'a.ts' })).toThrow();
  });

  it('defaults fetch to pruning origin', () => {
    expect(schemas.FetchRequest.parse({ repoId: 'r' })).toMatchObject({
      remote: 'origin',
      prune: true,
    });
  });
});

describe('OpenExternalRequest', () => {
  it.each(['https://github.com/o/r', 'http://localhost:3000/x', 'mailto:dev@example.com'])(
    'accepts %s',
    (url) => {
      expect(schemas.OpenExternalRequest.parse({ url }).url).toBe(url);
    },
  );

  it.each([
    // `openExternal` hands the scheme to the OS's registered handler, so each of
    // these is a real capability the renderer must not be able to reach for.
    ['a local file', 'file:///etc/passwd'],
    ['script execution', 'javascript:alert(1)'],
    ['an inline payload', 'data:text/html,<script>alert(1)</script>'],
    ['an SMB share', 'smb://attacker.example/share'],
    ['a custom app scheme', 'ms-msdt:/id/PCWDiagnostic'],
    ['a bare host', 'github.com/o/r'],
    ['a relative path', '/etc/passwd'],
    // The WHATWG parser strips leading whitespace and control characters before
    // reading the scheme, so this is `javascript:` by the time anything sees it.
    ['whitespace-smuggled script execution', ' \njavascript:alert(1)'],
  ])('rejects %s', (_label, url) => {
    expect(() => schemas.OpenExternalRequest.parse({ url })).toThrow();
  });

  it('rejects a protocol whose prefix is on the allow-list', () => {
    // `https:` is allowed; `httpsx:` merely starts with it. The check compares
    // the parsed protocol exactly rather than testing the raw string's prefix.
    expect(schemas.isOpenableExternally('httpsx://evil.example')).toBe(false);
  });

  it('normalises to the parsed href, so main opens what was validated', () => {
    // If main passed the caller's raw string on instead, the string the OS
    // receives would be one this validation never actually inspected.
    expect(schemas.normalizeExternalUrl(' https://ok.example')).toBe('https://ok.example/');
    expect(schemas.normalizeExternalUrl('nope')).toBeNull();
  });
});

describe('forge schemas', () => {
  it('caps a listing so a sidebar section cannot spawn an unbounded gh call', () => {
    expect(schemas.ForgeRunsRequest.parse({ repoId: 'r' }).limit).toBe(20);
    expect(() => schemas.ForgePullsRequest.parse({ repoId: 'r', limit: 500 })).toThrow();
    expect(() => schemas.ForgeRunsRequest.parse({ repoId: 'r', limit: 0 })).toThrow();
  });

  it('leaves branch optional — omitted means every branch', () => {
    expect(schemas.ForgeRunsRequest.parse({ repoId: 'r' }).branch).toBeUndefined();
    expect(schemas.ForgeRunsRequest.parse({ repoId: 'r', branch: 'main' }).branch).toBe('main');
  });

  it('keeps an unfinished run distinguishable from a failed one', () => {
    // The whole point of a nullable conclusion: defaulting it to anything
    // would paint a queued run with a verdict nobody has reached.
    const parsed = schemas.ForgeRunsResponse.parse({
      cli: { reason: 'ready' },
      runs: [
        {
          id: '1',
          name: 'CI',
          status: 'queued',
          createdAt: '2026-08-26T10:00:00Z',
          url: 'https://github.com/o/r/actions/runs/1',
        },
      ],
    });
    expect(parsed.runs[0]?.conclusion).toBeNull();
    expect(parsed.error).toBeNull();
  });

  it('lets an empty listing and an unavailable CLI stay different answers', () => {
    const ready = schemas.ForgePullsResponse.parse({ cli: { reason: 'ready' } });
    const missing = schemas.ForgePullsResponse.parse({
      cli: { reason: 'not-installed', hint: 'Install the GitHub CLI.' },
    });
    expect(ready.pulls).toEqual([]);
    expect(missing.pulls).toEqual([]);
    // Same empty list, different reason — which is what the envelope buys.
    expect(ready.cli.reason).not.toBe(missing.cli.reason);
  });

  it('rejects a forge status with a reason it cannot render', () => {
    expect(() => schemas.ForgeCliStatusResponse.parse({ reason: 'probably-fine' })).toThrow();
  });

  it('has a request schema for every forge channel', () => {
    // The same guard the pty/terminal table applies: a forge channel added
    // without a schema is unvalidated input reaching a subprocess.
    const expected: Record<string, string[]> = {
      forgeCliStatus: ['ForgeCliStatusRequest', 'ForgeCliStatusResponse'],
      forgeRuns: ['ForgeRunsRequest', 'ForgeRunsResponse'],
      forgePulls: ['ForgePullsRequest', 'ForgePullsResponse'],
    };
    const channelKeys = Object.keys(CHANNELS).filter((key) => key.startsWith('forge'));
    expect(channelKeys.sort()).toEqual(Object.keys(expected).sort());
    for (const names of Object.values(expected)) {
      for (const name of names) expect(schemas).toHaveProperty(name);
    }
  });
});

describe('metrics schemas', () => {
  it('accepts a sample carrying nothing but a timestamp', () => {
    // A machine where every probe failed is a valid sample, not an error. The
    // renderer renders no readouts at all for it, which is the honest answer.
    expect(() => schemas.MetricsSampleEvent.parse({ at: 1 })).not.toThrow();
  });

  it('keeps "unreadable" and "zero" as different answers, all the way down', () => {
    const absent = schemas.MetricsSampleEvent.parse({ at: 1, cpu: 40 });
    const zero = schemas.MetricsSampleEvent.parse({ at: 1, cpu: 40, gpu: 0 });
    expect(absent.gpu).toBeUndefined();
    expect(zero.gpu).toBe(0);
    // Distinguishable by presence, not by value — which is what lets the chart
    // drop the series instead of drawing a flat zero line.
    expect('gpu' in absent).toBe(false);
    expect('gpu' in zero).toBe(true);
  });

  it('rejects a percentage outside 0-100', () => {
    expect(() => schemas.MetricsSampleEvent.parse({ at: 1, cpu: 101 })).toThrow();
    expect(() => schemas.MetricsSampleEvent.parse({ at: 1, memory: -1 })).toThrow();
  });

  it('omits load1 rather than reporting win32\'s hard-coded zero', () => {
    // libuv returns [0,0,0] on win32; the field being optional is what keeps
    // that from reading as a genuinely idle machine.
    const parsed = schemas.MetricsSampleEvent.parse({ at: 1, cpuInfo: { cores: 8 } });
    expect(parsed.cpuInfo?.load1).toBeUndefined();
  });

  it('bounds the cadence the renderer may ask for', () => {
    // The floor matters: the GPU probe spawns a subprocess per tick, so a
    // renderer bug asking for 10ms would fork-bomb the machine.
    expect(() => schemas.MetricsStartRequest.parse({ intervalMs: 10 })).toThrow();
    expect(() => schemas.MetricsStartRequest.parse({ intervalMs: 600_000 })).toThrow();
    expect(schemas.MetricsStartRequest.parse({ intervalMs: 2_000 }).intervalMs).toBe(2_000);
  });

  it('offers both cadences inside the bounds it enforces', () => {
    for (const interval of [METRICS_ACTIVE_INTERVAL_MS, METRICS_IDLE_INTERVAL_MS]) {
      expect(() => schemas.MetricsStartRequest.parse({ intervalMs: interval })).not.toThrow();
    }
  });

  it('reports which metrics a sample actually carries', () => {
    expect(metricsPresent({ at: 1, cpu: 10, gpu: 0 })).toEqual(['cpu', 'gpu']);
    expect(metricsPresent({ at: 1 })).toEqual([]);
  });

  it('covers every metrics channel with a schema', () => {
    const expected: Record<string, string[]> = {
      metricsStart: ['MetricsStartRequest'],
      // `stop` carries no payload at all — there is nothing to validate.
      metricsStop: [],
      metricsSample: ['MetricsSampleEvent'],
    };
    const channelKeys = [...Object.keys(CHANNELS), ...Object.keys(EVENT_CHANNELS)].filter((key) =>
      key.startsWith('metrics'),
    );
    expect(channelKeys.sort()).toEqual(Object.keys(expected).sort());
    for (const names of Object.values(expected)) {
      for (const name of names) expect(schemas).toHaveProperty(name);
    }
  });
});

describe('keybindings', () => {
  it('binds every command at most once', () => {
    const commands = DEFAULT_KEYMAP.map((b) => b.command);
    expect(new Set(commands).size).toBe(commands.length);
  });

  it('binds every chord at most once', () => {
    const chords = DEFAULT_KEYMAP.map((b) => b.chord);
    expect(new Set(chords).size).toBe(chords.length);
  });

  it('only binds known command ids', () => {
    for (const binding of DEFAULT_KEYMAP) expect(isCommandId(binding.command)).toBe(true);
  });

  it('toggles the terminal with Ctrl+` on every platform', () => {
    // macOS reserves Cmd+` for cycling windows within an app — taking it would
    // break a system gesture, so this must stay Ctrl even on darwin.
    const toggle = DEFAULT_KEYMAP.find((b) => b.command === 'terminal.toggle');
    expect(toggle?.chord).toBe('Ctrl+`');
    expect(toggle?.chord.startsWith('Mod')).toBe(false);
  });

  it('lets the terminal toggle escape xterm', () => {
    // Scope `global` is what puts a chord on the allow-list that bypasses the
    // terminal's key handling; without it the toggle dies inside the shell.
    expect(GLOBAL_CHORDS).toContain('Ctrl+`');
  });

  it('rejects an unknown command id', () => {
    expect(isCommandId('nope.nope')).toBe(false);
    expect(COMMAND_IDS.length).toBeGreaterThan(0);
  });
});


describe('LogStartRequest.revisions', () => {
  it('defaults to every ref, so a pre-filter payload still parses', () => {
    const parsed = schemas.LogStartRequest.parse({ repoId: 'r1', requestId: 'r1#1' });
    expect(parsed.revisions).toEqual([]);
    expect(parsed.limit).toBe(50_000);
  });

  it('carries fully-qualified refs through unchanged', () => {
    // Fully-qualified because `main` and `origin/main` are different commits
    // with the same short name, and `git log main` would resolve one silently.
    const parsed = schemas.LogStartRequest.parse({
      repoId: 'r1',
      requestId: 'r1#2',
      revisions: ['refs/heads/main', 'refs/remotes/origin/main'],
    });
    expect(parsed.revisions).toEqual(['refs/heads/main', 'refs/remotes/origin/main']);
  });
});

/**
 * The `pty:*` and `terminal:*` payloads, swept as a table.
 *
 * A table rather than a describe-block each so that adding a channel without a
 * schema test shows up as a missing row instead of as silence — the coverage
 * assertion at the end of this block is what turns that from a convention into
 * a failure. There were no pty schema tests at all before this, which is how
 * `PtyCreateRequest` grew four fields across Phase 15 without one.
 */
describe('terminal and pty schemas', () => {
  const session = {
    id: 's1',
    kind: 'shell' as const,
    title: 'midnite-git',
    cwd: '/repo',
    repoId: 'r1',
    createdAt: 0,
  };

  const ptyCreate = {
    sessionId: 's1',
    kind: 'shell' as const,
    repoId: 'r1',
    cwd: '/repo',
    cols: 80,
    rows: 24,
  };

  /**
   * Each row: the schema, one payload that must parse, and payloads that must
   * not — each paired with what it is actually testing, so a failure names the
   * rule rather than an index.
   */
  const CASES: {
    name: string;
    schema: { parse: (value: unknown) => unknown };
    valid: unknown;
    invalid: [string, unknown][];
  }[] = [
    {
      name: 'PtyCreateRequest',
      schema: schemas.PtyCreateRequest,
      valid: ptyCreate,
      invalid: [
        // The session record exists before the process does; a pty with no
        // session to append its output to has nowhere to write scrollback.
        ['no sessionId', { ...ptyCreate, sessionId: undefined }],
        ['empty sessionId', { ...ptyCreate, sessionId: '' }],
        ['unknown kind', { ...ptyCreate, kind: 'wizard' }],
        // Zero or fractional dimensions reach node-pty, which is a native
        // module — a bad size there is not a validation error, it is a crash.
        ['zero cols', { ...ptyCreate, cols: 0 }],
        ['fractional rows', { ...ptyCreate, rows: 24.5 }],
        ['negative rows', { ...ptyCreate, rows: -1 }],
      ],
    },
    {
      name: 'PtyCreateResponse',
      schema: schemas.PtyCreateResponse,
      valid: { ok: true, ptyId: 'p1' },
      invalid: [
        // The discriminant is the whole contract: node-pty is loaded lazily and
        // fails soft, so a bare `{ptyId}` would read as neither arm.
        ['no discriminant', { ptyId: 'p1' }],
        ['failure without a message', { ok: false }],
        ['success without a ptyId', { ok: true }],
      ],
    },
    {
      name: 'PtyInputRequest',
      schema: schemas.PtyInputRequest,
      valid: { ptyId: 'p1', data: 'ls\r' },
      invalid: [['no data', { ptyId: 'p1' }]],
    },
    {
      name: 'PtyResizeRequest',
      schema: schemas.PtyResizeRequest,
      valid: { ptyId: 'p1', cols: 120, rows: 40 },
      invalid: [
        ['zero cols', { ptyId: 'p1', cols: 0, rows: 40 }],
        ['fractional cols', { ptyId: 'p1', cols: 120.5, rows: 40 }],
      ],
    },
    {
      name: 'PtyKillRequest',
      schema: schemas.PtyKillRequest,
      valid: { ptyId: 'p1' },
      invalid: [['no ptyId', {}]],
    },
    {
      name: 'PtyExitEvent',
      schema: schemas.PtyExitEvent,
      valid: { ptyId: 'p1', exitCode: 0 },
      invalid: [
        ['no exitCode', { ptyId: 'p1' }],
        ['fractional exitCode', { ptyId: 'p1', exitCode: 1.5 }],
      ],
    },
    {
      name: 'TerminalListResponse',
      schema: schemas.TerminalListResponse,
      valid: { sessions: [{ session, scrollback: new Uint8Array([0x24, 0x20]) }] },
      invalid: [
        // Scrollback crosses as raw pty bytes via structured clone, never as a
        // string — decoding it anywhere but xterm mangles escape sequences.
        ['scrollback as a string', { sessions: [{ session, scrollback: '$ ' }] }],
        ['scrollback as a number array', { sessions: [{ session, scrollback: [36, 32] }] }],
        ['session missing its cwd', { sessions: [{ session: { ...session, cwd: undefined }, scrollback: new Uint8Array() }] }],
      ],
    },
    {
      name: 'TerminalSaveRequest',
      schema: schemas.TerminalSaveRequest,
      valid: { session },
      // The agent case is a POSITIVE one and lives in its own test below.
      invalid: [
        ['no session', {}],
        // `kind` and `agentId` are one fact; either half alone degrades silently.
        ['an agent session with no agentId to start it', { session: { ...session, kind: 'agent' } }],
        ['a shell session carrying an agentId', { session: { ...session, agentId: 'claude' } }],
      ],
    },
    {
      name: 'TerminalForgetRequest',
      schema: schemas.TerminalForgetRequest,
      valid: { sessionId: 's1' },
      invalid: [['empty sessionId', { sessionId: '' }]],
    },
    {
      name: 'TerminalReorderRequest',
      schema: schemas.TerminalReorderRequest,
      valid: { sessionIds: ['s1', 's2'] },
      invalid: [
        // The whole order, not a moved-from/moved-to pair — but an empty id in
        // it would silently drop a session on replay.
        ['an empty id in the list', { sessionIds: ['s1', ''] }],
        ['ids as numbers', { sessionIds: [1, 2] }],
      ],
    },
  ];

  for (const { name, schema, valid, invalid } of CASES) {
    describe(name, () => {
      it('parses a well-formed payload', () => {
        expect(() => schema.parse(valid)).not.toThrow();
      });

      for (const [why, payload] of invalid) {
        it(`rejects ${why}`, () => {
          expect(() => schema.parse(payload)).toThrow();
        });
      }
    });
  }

  it('carries an agent session through save unchanged', () => {
    // `agent` differs from `shell` only by what was typed into it on startup,
    // so the record has to round-trip `agentId` rather than normalise it away.
    const agent = { ...session, kind: 'agent' as const, agentId: 'claude' };
    expect(schemas.TerminalSaveRequest.parse({ session: agent })).toMatchObject({
      session: { kind: 'agent', agentId: 'claude' },
    });
  });

  it('defaults an agent pty to no initial input', () => {
    // `initialInput` is what makes an agent session an agent session; it must
    // stay absent rather than becoming '' when nobody sets it.
    expect(schemas.PtyCreateRequest.parse(ptyCreate).initialInput).toBeUndefined();
    expect(
      schemas.PtyCreateRequest.parse({ ...ptyCreate, kind: 'agent', agentId: 'claude', initialInput: 'claude\r' })
        .initialInput,
    ).toBe('claude\r');
  });

  /**
   * The one channel in this family that crosses without a zod schema.
   *
   * `pty:data` is a firehose — one message per chunk of shell output, which for
   * anything scrolling is hundreds a second — carrying `{ptyId, data:
   * Uint8Array}` typed on the bridge alone. Parsing every chunk would put zod on
   * the path of each keystroke's echo to buy approximately nothing: the payload
   * is raw bytes whose only consumer is xterm, and its shape is fixed by the
   * emitter in main rather than supplied by a renderer.
   *
   * Listed rather than skipped, so the guard below still fires for the NEXT
   * channel added without validation and this stays a decision on the record
   * instead of an omission nobody notices.
   */
  const UNVALIDATED_BY_DESIGN = ['ptyData'];

  /**
   * The reason this block is a table.
   *
   * Every `pty:*` and `terminal:*` channel must appear above by name. A new
   * channel added without a row fails here, rather than shipping unvalidated.
   */
  it('covers every pty and terminal channel', () => {
    const covered = new Set(CASES.map((c) => c.name));
    const expected: Record<string, string[]> = {
      ptyCreate: ['PtyCreateRequest', 'PtyCreateResponse'],
      ptyInput: ['PtyInputRequest'],
      ptyResize: ['PtyResizeRequest'],
      ptyKill: ['PtyKillRequest'],
      ptyExit: ['PtyExitEvent'],
      terminalList: ['TerminalListResponse'],
      terminalSave: ['TerminalSaveRequest'],
      terminalForget: ['TerminalForgetRequest'],
      terminalReorder: ['TerminalReorderRequest'],
    };

    const channelKeys = [...Object.keys(CHANNELS), ...Object.keys(EVENT_CHANNELS)]
      .filter((key) => key.startsWith('pty') || key.startsWith('terminal'))
      .filter((key) => !UNVALIDATED_BY_DESIGN.includes(key));

    expect(channelKeys.sort()).toEqual(Object.keys(expected).sort());
    for (const names of Object.values(expected)) {
      for (const schemaName of names) expect(covered).toContain(schemaName);
    }
  });

  it('keeps the unvalidated list honest', () => {
    // An exemption for a channel that no longer exists is a comment claiming a
    // decision nobody is still making.
    const all = [...Object.keys(CHANNELS), ...Object.keys(EVENT_CHANNELS)];
    for (const key of UNVALIDATED_BY_DESIGN) expect(all).toContain(key);
  });
});
