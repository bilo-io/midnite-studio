import { describe, expect, it } from 'vitest';

import {
  bundleFindings,
  bundlePathFor,
  checkBundleIntegrity,
  classifySignature,
  codesignDisplayArgs,
  codesignVerifyArgs,
  spctlAssessArgs,
  type BundleCheckResult,
} from './bundle-check';
import type { IntegrityRunProcess } from './run-process';

const APP = '/Applications/Midnite Studio.app';

describe('the bundle self-check', () => {
  it("runs Phase 91 H's checks with their exact flags", () => {
    expect(codesignVerifyArgs(APP)).toEqual(['--verify', '--deep', '--strict', APP]);
    expect(spctlAssessArgs(APP)).toEqual(['--assess', '--type', 'execute', APP]);
    expect(codesignDisplayArgs(APP)).toEqual(['-dv', '--verbose=2', APP]);
  });

  it('finds the .app an executable runs from', () => {
    expect(bundlePathFor(`${APP}/Contents/MacOS/Midnite Studio`)).toBe(APP);
    expect(bundlePathFor('/x/Electron.app/Contents/Frameworks/H.app/Contents/MacOS/H')).toBe(
      '/x/Electron.app/Contents/Frameworks/H.app',
    );
    expect(bundlePathFor('/usr/local/bin/node')).toBeUndefined();
  });

  it('reads the signature kind from codesign -dv', () => {
    expect(classifySignature(0, 'Executable=/x\nSignature=adhoc\nTeamIdentifier=not set').signature).toBe('adhoc');
    expect(
      classifySignature(0, 'Authority=Developer ID Application: Bilo (ABCDE12345)\nTeamIdentifier=ABCDE12345'),
    ).toEqual({ signature: 'developer-id', teamId: 'ABCDE12345' });
    expect(classifySignature(1, '/x: code object is not signed at all').signature).toBe('unsigned');
    expect(classifySignature(1, 'weird').signature).toBe('unknown');
  });

  it('runs nothing off macOS or outside a bundle', async () => {
    const run: IntegrityRunProcess = async () => {
      throw new Error('should not run');
    };
    expect(await checkBundleIntegrity({ execPath: `${APP}/Contents/MacOS/M`, runProcess: run, platform: 'linux' })).toBeUndefined();
    expect(await checkBundleIntegrity({ execPath: '/usr/bin/node', runProcess: run, platform: 'darwin' })).toBeUndefined();
  });

  it('assembles a result from the three commands', async () => {
    const run: IntegrityRunProcess = async (cmd, args) => {
      if (cmd.endsWith('codesign') && args[0] === '--verify') return { ok: true, stdout: '', stderr: `${APP}: a sealed resource is missing or invalid\n`, exitCode: 1 };
      if (cmd.endsWith('spctl')) return { ok: true, stdout: '', stderr: 'rejected', exitCode: 3 };
      return { ok: true, stdout: '', stderr: 'Signature=adhoc', exitCode: 0 };
    };
    expect(await checkBundleIntegrity({ execPath: `${APP}/Contents/MacOS/M`, runProcess: run, platform: 'darwin' })).toEqual({
      bundle: APP,
      sealOk: false,
      sealError: `${APP}: a sealed resource is missing or invalid`,
      gatekeeperOk: false,
      signature: 'adhoc',
    });
  });
});

describe('bundleFindings severity', () => {
  const adhoc: BundleCheckResult = { bundle: APP, sealOk: true, gatekeeperOk: false, signature: 'adhoc' };
  const broken: BundleCheckResult = { ...adhoc, sealOk: false, sealError: 'modified' };
  const good: BundleCheckResult = { bundle: APP, sealOk: true, gatekeeperOk: true, signature: 'developer-id' };

  it('grades an ad-hoc build info on a dev build and critical on a notarised release', () => {
    expect(bundleFindings(adhoc, { packaged: false, expectDeveloperId: false }).findings.map((f) => f.severity)).toEqual(['info']);
    expect(bundleFindings(adhoc, { packaged: true, expectDeveloperId: true }).findings.map((f) => f.severity)).toEqual(['critical']);
  });

  it('grades a broken seal critical on any installed build, info in dev', () => {
    const packaged = bundleFindings(broken, { packaged: true, expectDeveloperId: false }).findings;
    expect(packaged.find((f) => f.fingerprint.includes(':seal:'))?.severity).toBe('critical');
    const dev = bundleFindings(broken, { packaged: false, expectDeveloperId: false }).findings;
    expect(dev.find((f) => f.fingerprint.includes(':seal:'))?.severity).toBe('info');
  });

  it('yields nothing for a sealed, notarised build and clears both fingerprints', () => {
    const { findings, cleared } = bundleFindings(good, { packaged: true, expectDeveloperId: true });
    expect(findings).toEqual([]);
    expect(cleared).toHaveLength(2);
    for (const f of bundleFindings(broken, { packaged: true, expectDeveloperId: true }).findings) {
      expect(f.category).toBe('integrity');
    }
  });
});
