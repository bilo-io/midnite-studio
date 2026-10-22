import { describe, expect, it } from 'vitest';

import { HOME, PLIST_AMOS, PLIST_HOMEBREW } from './__fixtures__/sensor-fixtures';
import { UNKNOWN_SIGNATURE } from './code-signing';
import {
  classifyPersistence,
  cronEntry,
  diffPersistence,
  isHiddenOrTempTarget,
  launchTarget,
  parseLaunchPlistJson,
  persistenceLocations,
  toBaseline,
  type PersistenceEntry,
} from './persistence-parse';

const signed = { ...UNKNOWN_SIGNATURE, signed: true, accepted: true, teamId: 'T' };
const adhoc = { ...signed, adhoc: true };

describe('launchd plists', () => {
  it('parses ProgramArguments and the target', () => {
    const item = parseLaunchPlistJson(PLIST_HOMEBREW)!;
    expect(item.programArguments[0]).toBe('/opt/homebrew/opt/postgresql@16/bin/postgres');
    expect(launchTarget(item)).toBe('/opt/homebrew/opt/postgresql@16/bin/postgres');
    expect(item.keepAlive).toBe(true);
  });
  it('prefers Program over ProgramArguments[0], and rejects non-objects', () => {
    expect(launchTarget(parseLaunchPlistJson('{"Program":"/a","ProgramArguments":["/b"]}')!)).toBe('/a');
    expect(parseLaunchPlistJson('[]')).toBeNull();
    expect(parseLaunchPlistJson('not json')).toBeNull();
  });
  it('classifies the Homebrew agent high and the AMOS-shaped one critical', () => {
    const brew = launchTarget(parseLaunchPlistJson(PLIST_HOMEBREW)!)!;
    expect(
      classifyPersistence({ kind: 'launch-agent', target: brew, signature: adhoc, home: HOME }).severity,
    ).toBe('high');
    const amos = launchTarget(parseLaunchPlistJson(PLIST_AMOS)!)!;
    const c = classifyPersistence({ kind: 'launch-agent', target: amos, signature: signed, home: HOME });
    expect(c.severity).toBe('critical');
    expect(c.reasons.join()).toMatch(/hidden/);
  });
  it('is critical for an unsigned or quarantined target and high otherwise', () => {
    const base = { kind: 'launch-daemon', target: '/Library/Foo/foo', home: HOME } as const;
    expect(classifyPersistence({ ...base, signature: UNKNOWN_SIGNATURE }).severity).toBe('critical');
    expect(classifyPersistence({ ...base, signature: { ...signed, quarantined: true } }).severity).toBe(
      'critical',
    );
    expect(classifyPersistence({ ...base, signature: signed }).severity).toBe('high');
    expect(classifyPersistence({ kind: 'shell-rc', home: HOME }).severity).toBe('high');
  });
  it('hidden and temp targets', () => {
    expect(isHiddenOrTempTarget('/tmp/p', HOME)).toBe(true);
    expect(isHiddenOrTempTarget(`${HOME}/.cargo/bin/x`, HOME)).toBe(false);
    expect(isHiddenOrTempTarget(`${HOME}/Applications/Foo.app/Contents/MacOS/Foo`, HOME)).toBe(false);
    expect(isHiddenOrTempTarget(`${HOME}/.hidden/payload`, HOME)).toBe(true);
  });
});

describe('baseline diff', () => {
  const e = (path: string, hash: string): PersistenceEntry => ({
    key: `shell-rc:${path}`,
    kind: 'shell-rc',
    path,
    hash,
  });
  it('separates added, changed and removed', () => {
    const baseline = toBaseline([e('/a', '1'), e('/b', '2'), e('/c', '3')]);
    const d = diffPersistence(baseline, [e('/a', '1'), e('/b', 'X'), e('/d', '4')]);
    expect(d.added.map((x) => x.path)).toEqual(['/d']);
    expect(d.changed.map((x) => x.path)).toEqual(['/b']);
    expect(d.removed.map((x) => x.path)).toEqual(['/c']);
  });
  it('treats an empty crontab and comments-only crontab as the same', () => {
    expect(cronEntry('').hash).toBe(cronEntry('# comment\n\n').hash);
    expect(cronEntry('* * * * * /x').hash).not.toBe(cronEntry('').hash);
  });
  it('covers the documented locations', () => {
    const paths = persistenceLocations(HOME).map((l) => l.path);
    for (const p of [
      `${HOME}/Library/LaunchAgents`,
      '/Library/LaunchAgents',
      '/Library/LaunchDaemons',
      `${HOME}/.zshrc`,
      `${HOME}/.ssh/authorized_keys`,
      `${HOME}/.ssh/config`,
      '/etc/periodic',
    ])
      expect(paths).toContain(p);
  });
});
