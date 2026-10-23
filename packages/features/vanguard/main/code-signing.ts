import type { SensorRunProcess } from './sensor-host';

/**
 * Signature state of one executable (Phase 120 Theme D): what `codesign`, `spctl` and the quarantine xattr
 * say about it. The parsers are pure and fixture-tested; {@link inspectExecutable} is the thin shell-out.
 */
export interface SignatureState {
  /** A code signature of any kind is present. */
  signed: boolean;
  /** Ad-hoc signature (no identity behind it: what every locally built arm64 binary carries). */
  adhoc: boolean;
  teamId?: string;
  authority?: string;
  /** `spctl --assess` accepted it (Gatekeeper would run it). */
  accepted: boolean;
  /** Carries `com.apple.quarantine` (downloaded and not yet cleared). */
  quarantined: boolean;
}

export const UNKNOWN_SIGNATURE: SignatureState = {
  signed: false,
  adhoc: false,
  accepted: false,
  quarantined: false,
};

/** `codesign -dv --verbose=2 <path>` writes its report to stderr. */
export function parseCodesignOutput(
  output: string,
  exitCode: number | null,
): Pick<SignatureState, 'signed' | 'adhoc' | 'teamId' | 'authority'> {
  if (exitCode !== 0 || /not signed at all/i.test(output)) {
    return { signed: false, adhoc: false };
  }
  const adhoc =
    /^Signature=adhoc\s*$/m.test(output) || /flags=0x[0-9a-f]+\([^)]*adhoc/i.test(output);
  const team = /^TeamIdentifier=(\S+)\s*$/m.exec(output)?.[1];
  const authority = /^Authority=(.+)$/m.exec(output)?.[1]?.trim();
  return {
    signed: true,
    adhoc,
    ...(team !== undefined && team !== 'not' && team !== 'not set' ? { teamId: team } : {}),
    ...(authority !== undefined ? { authority } : {}),
  };
}

/** `spctl --assess --type execute <path>`: exit 0 and "accepted" (or silence) means Gatekeeper allows it. */
export function parseSpctlAssess(output: string, exitCode: number | null): boolean {
  if (exitCode !== 0) return false;
  return !/rejected/i.test(output);
}

const spawnOk = <T>(r: { ok: boolean } & T): r is { ok: true } & T => r.ok;

/** Inspects one executable. Never throws; a command that cannot run leaves its field at the safe default. */
export async function inspectExecutable(
  run: SensorRunProcess,
  path: string,
  signal?: AbortSignal,
): Promise<SignatureState> {
  const opts = { timeoutMs: 8_000, ...(signal ? { signal } : {}) };
  const [cs, sp, xa] = await Promise.all([
    run('codesign', ['-dv', '--verbose=2', path], opts),
    run('spctl', ['--assess', '--type', 'execute', path], opts),
    run('xattr', ['-p', 'com.apple.quarantine', path], opts),
  ]);
  const signature = spawnOk(cs)
    ? parseCodesignOutput(`${cs.stderr}\n${cs.stdout}`, cs.exitCode)
    : { signed: false, adhoc: false };
  return {
    ...signature,
    accepted: spawnOk(sp) ? parseSpctlAssess(`${sp.stderr}\n${sp.stdout}`, sp.exitCode) : false,
    quarantined: spawnOk(xa) ? xa.exitCode === 0 && xa.stdout.trim().length > 0 : false,
  };
}

/** Whether the signature is the kind a user cannot attribute to anyone: none, or ad-hoc. */
export const isUnsigned = (s: SignatureState): boolean => !s.signed || s.adhoc;
