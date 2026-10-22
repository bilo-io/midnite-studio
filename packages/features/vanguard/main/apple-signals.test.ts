import { CONFIG_FINDING_FINGERPRINTS, DEFAULT_VANGUARD_SETTINGS, type NewSecurityFinding } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import {
  createAppleSignalsSensor,
  denialFingerprint,
  isXProtectStale,
  parseGatekeeperStatus,
  parseLogDenials,
  parseSipStatus,
  parseXProtectVersion,
} from './apple-signals';
import type { SensorContext, SensorRunProcess } from './sensor-host';

const LOG = [
  JSON.stringify({
    timestamp: '2026-10-23 10:00:00.1',
    subsystem: 'com.apple.syspolicy',
    eventMessage: 'Gatekeeper denied execution of /Users/dev/Downloads/x (pid 4821)',
    processImagePath: '/usr/libexec/syspolicyd',
  }),
  JSON.stringify({
    subsystem: 'com.apple.syspolicy',
    eventMessage: 'Evaluating assessment for /Applications/Foo.app',
    processImagePath: '/usr/libexec/syspolicyd',
  }),
  JSON.stringify({
    eventMessage: 'Detected MACOS.AMOS.A and remediated it',
    processImagePath: '/Library/Apple/System/Library/CoreServices/XProtect.app/Contents/MacOS/XProtectRemediatorAMOS',
  }),
  'garbage line',
].join('\n');

describe('apple signal parsers', () => {
  it('spctl and csrutil status', () => {
    expect(parseGatekeeperStatus('assessments enabled')).toBe(true);
    expect(parseGatekeeperStatus('assessments disabled')).toBe(false);
    expect(parseGatekeeperStatus('?')).toBeNull();
    expect(parseSipStatus('System Integrity Protection status: enabled.')).toBe(true);
    expect(parseSipStatus('System Integrity Protection status: disabled.')).toBe(false);
    expect(parseSipStatus('')).toBeNull();
  });
  it('XProtect version and staleness at 30 days', () => {
    expect(parseXProtectVersion('{"CFBundleShortVersionString":"5321"}')).toBe('5321');
    expect(parseXProtectVersion('x')).toBeNull();
    const day = 86_400_000;
    expect(isXProtectStale(0, 30 * day)).toBe(false);
    expect(isXProtectStale(0, 31 * day)).toBe(true);
  });
  it('keeps real denials and detections, drops chatter, and fingerprints ignore pids', () => {
    const d = parseLogDenials(LOG);
    expect(d.map((x) => x.source)).toEqual(['gatekeeper', 'xprotect']);
    expect(denialFingerprint({ source: 'gatekeeper', message: 'denied x (pid 1)' })).toBe(
      denialFingerprint({ source: 'gatekeeper', message: 'denied x (pid 22)' }),
    );
  });
});

describe('apple signals sensor', () => {
  it('records Gatekeeper off, SIP off, stale XProtect and a log denial', async () => {
    const recorded: NewSecurityFinding[] = [];
    const run: SensorRunProcess = async (cmd) => {
      const out: Record<string, string> = {
        spctl: 'assessments disabled',
        csrutil: 'System Integrity Protection status: disabled.',
        plutil: '{"CFBundleShortVersionString":"5300"}',
        log: LOG,
      };
      return { ok: true, stdout: out[cmd] ?? '', stderr: '', exitCode: 0 };
    };
    const ctx: SensorContext = {
      userData: '/u',
      homeDir: '/h',
      now: () => 100 * 86_400_000,
      runProcess: run,
      record: async (f) => (recorded.push({ ...f, source: 'vanguard' }), {} as never),
      settings: () => DEFAULT_VANGUARD_SETTINGS,
      signal: new AbortController().signal,
      log: () => undefined,
    };
    await createAppleSignalsSensor({ mtimeMs: async () => 0 }).run!(ctx);
    const fps = recorded.map((f) => f.fingerprint);
    expect(fps).toContain(CONFIG_FINDING_FINGERPRINTS.gatekeeperDisabled);
    expect(fps).toContain(CONFIG_FINDING_FINGERPRINTS.sipDisabled);
    expect(fps).toContain('apple:xprotect-stale');
    expect(recorded.find((f) => f.fingerprint === 'apple:xprotect-stale')).toMatchObject({ severity: 'medium' });
    expect(recorded.filter((f) => f.fingerprint.startsWith('apple:gatekeeper'))).toHaveLength(2); // once per predicate query
    expect(recorded.every((f) => f.severity !== 'critical')).toBe(true);
  });
});
