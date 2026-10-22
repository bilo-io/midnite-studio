import { randomUUID } from 'node:crypto';

import type { DownloadFileClass } from '@midnite/studio-shared';

import { needsGatekeeperAssessment } from './download-policy';

/**
 * What happens to a finished download (Phase 117 Theme D): quarantine attribute, SHA-256, a
 * Gatekeeper assessment, an optional local scan, and one ledger line. Every side effect comes in
 * through {@link QuarantineDeps}, so the order and the shape are tested against fakes and the real
 * `xattr`/`spctl`/`clamscan` only ever run in the packaged app.
 *
 * Never opens the file. There is no `shell.openPath` anywhere in this feature: "Show in Finder"
 * is the only affordance.
 */

export type ExecResult = { code: number; stdout: string; stderr: string };

export type QuarantineDeps = {
  platform: string;
  /** Runs a binary with args; resolves (never rejects) — a missing binary is `code: 127`. */
  exec: (file: string, args: string[]) => Promise<ExecResult>;
  sha256File: (path: string) => Promise<string>;
  appendLedger: (line: string) => Promise<void>;
  now: () => number;
};

export type DownloadRecord = {
  time: string;
  filename: string;
  path: string;
  size: number;
  sha256: string;
  origin: string;
  url: string;
  referrer: string;
  fileClass: DownloadFileClass;
  quarantined: boolean;
  gatekeeper?: string;
  scan?: string;
};

/** The value Gatekeeper reads: `flags;hex-seconds;agent;uuid`. 0083 = downloaded, user-initiated. */
export function quarantineValue(nowMs: number, uuid: string = randomUUID().toUpperCase()): string {
  return `0083;${Math.floor(nowMs / 1000).toString(16)};Midnite Browser;${uuid}`;
}

export function spctlArgs(fileClass: DownloadFileClass, path: string): string[] {
  if (fileClass === 'disk-image') return ['--assess', '--type', 'open', '--context', 'context:primary-signature', '-v', path];
  if (fileClass === 'installer') return ['--assess', '--type', 'install', '-v', path];
  return ['--assess', '--type', 'execute', '-v', path];
}

export async function finalizeDownload(
  input: { path: string; filename: string; size: number; origin: string; url: string; referrer: string; fileClass: DownloadFileClass },
  deps: QuarantineDeps,
): Promise<DownloadRecord> {
  const mac = deps.platform === 'darwin';
  let quarantined = false;
  if (mac) {
    const r = await deps.exec('/usr/bin/xattr', ['-w', 'com.apple.quarantine', quarantineValue(deps.now()), input.path]);
    quarantined = r.code === 0;
  }
  const sha256 = await deps.sha256File(input.path);

  let gatekeeper: string | undefined;
  if (mac && needsGatekeeperAssessment(input.fileClass)) {
    const r = await deps.exec('/usr/sbin/spctl', spctlArgs(input.fileClass, input.path));
    const text = `${r.stdout}${r.stderr}`.trim().split('\n')[0] ?? '';
    gatekeeper = r.code === 0 ? `accepted${text ? ` — ${text}` : ''}` : `rejected${text ? ` — ${text}` : ''}`;
  }

  let scan: string | undefined;
  const probe = await deps.exec('clamscan', ['--version']);
  if (probe.code === 0) {
    const r = await deps.exec('clamscan', ['--no-summary', input.path]);
    scan = r.code === 0 ? 'clean' : r.code === 1 ? `infected — ${r.stdout.trim().split('\n')[0] ?? ''}` : 'scan error';
  }

  const record: DownloadRecord = {
    time: new Date(deps.now()).toISOString(),
    filename: input.filename,
    path: input.path,
    size: input.size,
    sha256,
    origin: input.origin,
    url: input.url,
    referrer: input.referrer,
    fileClass: input.fileClass,
    quarantined,
    ...(gatekeeper !== undefined ? { gatekeeper } : {}),
    ...(scan !== undefined ? { scan } : {}),
  };
  await deps.appendLedger(`${JSON.stringify(record)}\n`);
  return record;
}

/** `name (2).ext` — the first leaf not already `taken`. */
export function uniqueLeaf(name: string, taken: (leaf: string) => boolean): string {
  if (!taken(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 2; n < 10_000; n++) {
    const leaf = `${stem} (${n})${ext}`;
    if (!taken(leaf)) return leaf;
  }
  return `${stem}-${randomUUID()}${ext}`;
}
