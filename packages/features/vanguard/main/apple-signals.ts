import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';

import { CONFIG_FINDING_FINGERPRINTS } from '@midnite/studio-shared';

import type { SensorDefinition } from './sensor-host';

/**
 * Apple's own security signals (Phase 120 Theme D): XProtect's age, Gatekeeper and XProtect denials read
 * from the unified log, and whether Gatekeeper and SIP are still on. Parsers are pure.
 */

export const XPROTECT_INFO_PLIST =
  '/Library/Apple/System/Library/CoreServices/XProtect.bundle/Contents/Info.plist';
export const XPROTECT_STALE_DAYS = 30;

export const SYSPOLICY_PREDICATE = 'subsystem == "com.apple.syspolicy"';
export const REMEDIATOR_PREDICATE = 'process == "XProtectRemediator"';

/** `spctl --status` prints "assessments enabled" or "assessments disabled". `null` when it said neither. */
export function parseGatekeeperStatus(output: string): boolean | null {
  if (/assessments\s+enabled/i.test(output)) return true;
  if (/assessments\s+disabled/i.test(output)) return false;
  return null;
}

/** `csrutil status` prints "System Integrity Protection status: enabled." (or disabled, or a custom config). */
export function parseSipStatus(output: string): boolean | null {
  const m = /System Integrity Protection status:\s*(enabled|disabled)/i.exec(output);
  if (m === null) return null;
  return m[1]!.toLowerCase() === 'enabled';
}

/** `CFBundleShortVersionString` out of `plutil -convert json -o -` of the XProtect bundle's Info.plist. */
export function parseXProtectVersion(json: string): string | null {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    const v = raw.CFBundleShortVersionString ?? raw.CFBundleVersion;
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

export const isXProtectStale = (updatedAtMs: number, nowMs: number): boolean =>
  nowMs - updatedAtMs > XPROTECT_STALE_DAYS * 86_400_000;

export interface LogDenial {
  source: 'gatekeeper' | 'xprotect';
  message: string;
  process?: string;
  timestamp?: string;
}

const GATEKEEPER_DENIAL =
  /\b(denied|denying|rejected|blocked|disallow(?:ed)?|not allowed|failed assessment|revoked)\b/i;
const XPROTECT_HIT = /\b(detected|remediat\w*|found|removed|blocked|infection|malware)\b/i;

/**
 * Parses `log show --style ndjson` output into denials. A syspolicy line counts only when it says it
 * denied or blocked something (the subsystem is otherwise chatty); every XProtectRemediator line that
 * reports a hit counts.
 */
export function parseLogDenials(ndjson: string): LogDenial[] {
  const out: LogDenial[] = [];
  for (const line of ndjson.split('\n')) {
    if (!line.startsWith('{')) continue;
    let rec: Record<string, unknown>;
    try {
      rec = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const message = typeof rec.eventMessage === 'string' ? rec.eventMessage : '';
    if (message === '') continue;
    const image = typeof rec.processImagePath === 'string' ? rec.processImagePath : undefined;
    const subsystem = typeof rec.subsystem === 'string' ? rec.subsystem : '';
    const isRemediator = (image ?? '').includes('XProtectRemediator');
    let source: LogDenial['source'] | null = null;
    if (isRemediator && XPROTECT_HIT.test(message)) source = 'xprotect';
    else if (subsystem === 'com.apple.syspolicy' && GATEKEEPER_DENIAL.test(message))
      source = 'gatekeeper';
    if (source === null) continue;
    out.push({
      source,
      message,
      ...(image !== undefined ? { process: image } : {}),
      ...(typeof rec.timestamp === 'string' ? { timestamp: rec.timestamp } : {}),
    });
  }
  return out;
}

/** Stable across re-reads of the same log line (the timestamp and pids are not part of it). */
export const denialFingerprint = (d: LogDenial): string =>
  `apple:${d.source}:${createHash('sha1')
    .update(d.message.replace(/\b\d+\b/g, '#'))
    .digest('hex')
    .slice(0, 16)}`;

export interface AppleSignalsDeps {
  /** mtime of XProtect's Info.plist; overridable for tests. */
  mtimeMs?: (path: string) => Promise<number | null>;
}

const nodeMtime = (path: string): Promise<number | null> =>
  stat(path).then(
    (s) => s.mtimeMs,
    () => null,
  );

export const APPLE_SIGNALS_SENSOR_ID = 'apple-signals';

export function createAppleSignalsSensor(deps: AppleSignalsDeps = {}): SensorDefinition {
  const mtime = deps.mtimeMs ?? nodeMtime;
  // The log window overlaps the previous run's by design (a gap would lose a denial), so a line already
  // recorded is skipped here rather than bumping its finding's count again.
  const seen = new Set<string>();
  return {
    id: APPLE_SIGNALS_SENSOR_ID,
    label: 'Apple security signals',
    description:
      'XProtect version and age, Gatekeeper and XProtect denials from the unified log, Gatekeeper and SIP status.',
    schedule: { kind: 'cadence' },
    async run(ctx) {
      const opts = { timeoutMs: 20_000, signal: ctx.signal };

      const gk = await ctx.runProcess('spctl', ['--status'], opts);
      if (gk.ok && parseGatekeeperStatus(`${gk.stdout}\n${gk.stderr}`) === false)
        await ctx.record({
          fingerprint: CONFIG_FINDING_FINGERPRINTS.gatekeeperDisabled,
          severity: 'high',
          category: 'config',
          title: 'Gatekeeper is turned off',
          detail:
            'spctl reports assessments disabled: unsigned and unnotarised downloads run without any check.',
          evidence: [{ kind: 'command', command: 'spctl', args: ['--status'] }],
          remediation: [{ id: 'mute' }],
        });

      const sip = await ctx.runProcess('csrutil', ['status'], opts);
      if (sip.ok && parseSipStatus(`${sip.stdout}\n${sip.stderr}`) === false)
        await ctx.record({
          fingerprint: CONFIG_FINDING_FINGERPRINTS.sipDisabled,
          severity: 'high',
          category: 'config',
          title: 'System Integrity Protection is turned off',
          detail:
            'csrutil reports SIP disabled: system files and processes are open to modification.',
          evidence: [{ kind: 'command', command: 'csrutil', args: ['status'] }],
          remediation: [{ id: 'mute' }],
        });

      const meta = await ctx.runProcess(
        'plutil',
        ['-convert', 'json', '-o', '-', XPROTECT_INFO_PLIST],
        opts,
      );
      const updated = await mtime(XPROTECT_INFO_PLIST);
      if (updated !== null && isXProtectStale(updated, ctx.now())) {
        const version = meta.ok ? parseXProtectVersion(meta.stdout) : null;
        const days = Math.floor((ctx.now() - updated) / 86_400_000);
        await ctx.record({
          fingerprint: 'apple:xprotect-stale',
          severity: 'medium',
          category: 'config',
          title: 'XProtect definitions are out of date',
          detail: `XProtect${version !== null ? ` ${version}` : ''} was last updated ${days} days ago (over ${XPROTECT_STALE_DAYS}). Check that automatic security updates are on.`,
          evidence: [{ kind: 'path', path: XPROTECT_INFO_PLIST }],
          remediation: [{ id: 'mute' }],
        });
      }

      const window = `${Math.max(60, ctx.settings().cadenceSeconds + 30)}s`;
      for (const predicate of [SYSPOLICY_PREDICATE, REMEDIATOR_PREDICATE]) {
        const log = await ctx.runProcess(
          'log',
          ['show', '--last', window, '--predicate', predicate, '--style', 'ndjson'],
          opts,
        );
        if (!log.ok) continue;
        for (const d of parseLogDenials(log.stdout)) {
          const key = `${d.timestamp ?? ''}|${d.message}`;
          if (seen.has(key)) continue;
          seen.add(key);
          if (seen.size > 1_000) seen.delete(seen.values().next().value as string);
          await ctx.record({
            fingerprint: denialFingerprint(d),
            severity: d.source === 'xprotect' ? 'high' : 'medium',
            category: d.source === 'xprotect' ? 'malware' : 'process',
            title:
              d.source === 'xprotect'
                ? 'XProtect reported a detection'
                : 'Gatekeeper denied an execution',
            detail: d.message,
            evidence: [{ kind: 'command', command: d.message.slice(0, 500) }],
            remediation: [{ id: 'mute' }],
          });
        }
      }
    },
  };
}
