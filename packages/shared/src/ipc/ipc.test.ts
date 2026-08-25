import { describe, expect, it } from 'vitest';

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
