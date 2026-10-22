import type { NewSecurityFinding } from '@midnite/studio-shared';

import type { IntegrityRunProcess } from './run-process';

/**
 * The bundle verifies itself at launch (Phase 120 C).
 *
 * The same three checks Phase 91 H put in front of every install, in the same order and with the same
 * flags: `codesign --verify --deep --strict` (is the seal intact? — `apps/launcher/install.sh`,
 * `scripts/verify-signature.mjs`), `spctl --assess --type execute` (would Gatekeeper run it? —
 * `install.sh`), and `codesign -dv --verbose=2` read for `Signature=adhoc` (the launcher's
 * `isAdHocSigned` in `apps/launcher/src/main/updater.ts`). Those live in a shell script and in the
 * launcher, which is off the package graph, so a feature cannot import them; the argument vectors below
 * are theirs verbatim, and the tests pin them.
 *
 * Severity, per the phase doc: an ad-hoc or unsigned result is `info` on a dev build and `critical` on a
 * release. Two inputs carry "release", because today they differ:
 * - `packaged` — an installed build. Every packaged build carries a seal, ad hoc or not, so a seal that
 *   fails `--verify` on one means the bundle changed after it was built: `critical`.
 * - `expectDeveloperId` — a build that should be Developer ID signed and notarised. Releases ship ad hoc
 *   until notarisation lands (`electron-builder.yml`, `install.sh`'s Gatekeeper warning), so this is
 *   false for now and an ad-hoc signature or a Gatekeeper rejection stays `info`. Once releases are
 *   notarised, the composer flips {@link RELEASES_ARE_NOTARISED} and the same result is `critical`.
 */

/** Flip once release builds are Developer ID signed and notarised (Phase 91 H's notarize.cjs path). */
export const RELEASES_ARE_NOTARISED = false;

const CODESIGN = '/usr/bin/codesign';
const SPCTL = '/usr/sbin/spctl';
const CHECK_TIMEOUT_MS = 120_000;

export const codesignVerifyArgs = (bundle: string): string[] => ['--verify', '--deep', '--strict', bundle];
export const spctlAssessArgs = (bundle: string): string[] => ['--assess', '--type', 'execute', bundle];
export const codesignDisplayArgs = (bundle: string): string[] => ['-dv', '--verbose=2', bundle];

export type BundleSignature = 'developer-id' | 'adhoc' | 'unsigned' | 'unknown';

export interface BundleCheckResult {
  bundle: string;
  sealOk: boolean;
  /** codesign's own words when the seal fails. */
  sealError?: string;
  gatekeeperOk: boolean;
  signature: BundleSignature;
  teamId?: string;
}

/** The `.app` an executable runs from (`…/X.app/Contents/MacOS/X` → `…/X.app`); `undefined` outside one. */
export function bundlePathFor(execPath: string): string | undefined {
  const marker = '.app/Contents/MacOS/';
  const at = execPath.lastIndexOf(marker);
  return at < 0 ? undefined : execPath.slice(0, at + '.app'.length);
}

/** Read `codesign -dv --verbose=2`'s report (it writes to stderr). */
export function classifySignature(exitCode: number | null, output: string): { signature: BundleSignature; teamId?: string } {
  if (/not signed at all/i.test(output)) return { signature: 'unsigned' };
  if (exitCode !== 0) return { signature: 'unknown' };
  if (output.includes('Signature=adhoc')) return { signature: 'adhoc' };
  const team = /^TeamIdentifier=(.+)$/m.exec(output)?.[1]?.trim();
  if (/^Authority=Developer ID Application:/m.test(output)) {
    return { signature: 'developer-id', ...(team && team !== 'not set' ? { teamId: team } : {}) };
  }
  return { signature: 'unknown', ...(team && team !== 'not set' ? { teamId: team } : {}) };
}

const firstLine = (text: string): string => text.split('\n').find((line) => line.trim().length > 0)?.trim() ?? '';

export async function checkBundleIntegrity(input: {
  execPath: string;
  runProcess: IntegrityRunProcess;
  platform?: NodeJS.Platform;
}): Promise<BundleCheckResult | undefined> {
  if ((input.platform ?? process.platform) !== 'darwin') return undefined;
  const bundle = bundlePathFor(input.execPath);
  if (bundle === undefined) return undefined;
  const run = input.runProcess;
  const verify = await run(CODESIGN, codesignVerifyArgs(bundle), { timeoutMs: CHECK_TIMEOUT_MS });
  const sealOk = verify.ok && verify.exitCode === 0;
  const sealError = sealOk
    ? undefined
    : verify.ok
      ? firstLine(`${verify.stderr}\n${verify.stdout}`) || `codesign exited ${verify.exitCode}`
      : verify.hint;
  const assess = await run(SPCTL, spctlAssessArgs(bundle), { timeoutMs: CHECK_TIMEOUT_MS });
  const gatekeeperOk = assess.ok && assess.exitCode === 0;
  const display = await run(CODESIGN, codesignDisplayArgs(bundle), { timeoutMs: CHECK_TIMEOUT_MS });
  const sig = display.ok ? classifySignature(display.exitCode, `${display.stdout}\n${display.stderr}`) : { signature: 'unknown' as const };
  return { bundle, sealOk, ...(sealError ? { sealError } : {}), gatekeeperOk, ...sig };
}

export type BundleFinding = Omit<NewSecurityFinding, 'source'>;

export const bundleFingerprint = (bundle: string, kind: 'seal' | 'signature'): string => `integrity:bundle:${kind}:${bundle}`;

/**
 * The findings a check yields — at most one for the seal and one for the signature — and the fingerprints
 * of the ones that no longer hold (a fixed install resolves the old finding).
 */
export function bundleFindings(
  result: BundleCheckResult,
  opts: { packaged: boolean; expectDeveloperId: boolean },
): { findings: BundleFinding[]; cleared: string[] } {
  const findings: BundleFinding[] = [];
  const cleared: string[] = [];
  const evidence = [{ kind: 'path' as const, path: result.bundle }];

  if (!result.sealOk) {
    findings.push({
      fingerprint: bundleFingerprint(result.bundle, 'seal'),
      severity: opts.packaged ? 'critical' : 'info',
      category: 'integrity',
      title: "The app's code signature does not verify",
      detail: `codesign --verify --deep --strict rejected ${result.bundle}: ${result.sealError ?? 'no reason given'}. ${
        opts.packaged
          ? 'An installed build is sealed when it is built, so a file inside it changed afterwards. Reinstall from a release you trust.'
          : 'This is a development build, whose bundle is rebuilt in place; the result is informational.'
      }`,
      evidence: [...evidence, { kind: 'command', command: CODESIGN, args: codesignVerifyArgs(result.bundle) }],
      remediation: [{ id: 'mute' }],
    });
  } else {
    cleared.push(bundleFingerprint(result.bundle, 'seal'));
  }

  const weak = result.signature !== 'developer-id' || !result.gatekeeperOk;
  if (weak) {
    const what =
      result.signature === 'adhoc'
        ? 'signed ad hoc'
        : result.signature === 'unsigned'
          ? 'not signed'
          : result.signature === 'developer-id'
            ? 'Developer ID signed'
            : 'of unknown signature';
    findings.push({
      fingerprint: bundleFingerprint(result.bundle, 'signature'),
      severity: opts.expectDeveloperId ? 'critical' : 'info',
      category: 'integrity',
      title: opts.expectDeveloperId ? 'The app is not signed the way a release should be' : 'The app is not notarised',
      detail: `${result.bundle} is ${what}${result.gatekeeperOk ? '' : ' and Gatekeeper rejects it (spctl --assess --type execute)'}. ${
        opts.expectDeveloperId
          ? 'A release build should carry a Developer ID signature that Gatekeeper accepts; this one does not, so it is not the build that was published.'
          : 'Builds ship ad hoc signed until notarisation lands, so this is expected and informational.'
      }`,
      evidence: [...evidence, { kind: 'command', command: SPCTL, args: spctlAssessArgs(result.bundle) }],
      remediation: [{ id: 'mute' }],
    });
  } else {
    cleared.push(bundleFingerprint(result.bundle, 'signature'));
  }
  return { findings, cleared };
}
