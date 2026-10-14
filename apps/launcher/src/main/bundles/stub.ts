import { execFile } from 'node:child_process';
import { access, constants, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import type { StubIdentity } from './layout';
import { stampPlist } from './plist-stamp';

/**
 * The Dock stub — Theme B's mechanism (`docs/spikes/dock-identity.md`, Decision 10), turned
 * from a spike script into a plan the launcher runs at install time:
 *
 *   <stubRoot>/Midnite Cleaner.app/Contents/
 *     Info.plist                ← the runtime's, stamped with the app's name, id, exe, icon
 *     MacOS/Midnite Cleaner     ← the runtime's main binary, APFS-cloned (`cp -c`)
 *     Frameworks/…              ← the runtime's frameworks, APFS-cloned (`cp -cR`)
 *     Resources/app.icns        ← the bundle's icon
 *     Resources/app/            ← the bundle itself, cloned in (a symlink out of the .app fails
 *                                 `codesign --verify --strict`, and Electron dies on a
 *                                 framework symlinked from outside — both measured in Theme B)
 *   then `codesign --force --deep --sign -` and `codesign --verify --deep --strict`.
 *
 * Why the helper apps are renamed: a packaged Electron finds its renderer/GPU helpers as
 * `Frameworks/<CFBundleName> Helper (…).app`, falling back to `Electron Helper`. The spike
 * cloned the *stock* Electron, whose helpers carry that fallback name, so it never hit this;
 * electron-builder renames the runtime's helpers to `Midnite Apps Helper (…)`, which a stub
 * called `Midnite Cleaner` would not find. So each helper is cloned under the stub's name, with
 * its executable and plist to match, and the `--deep` ad-hoc signature re-seals them.
 * Confirming this against a packaged runtime is the PR's one manual check.
 *
 * The plan is pure data (`planStub`) and runs through an injected {@link StubIo}, so its shape
 * is a unit test on any OS and only the darwin-only test exercises a real `cp -c`.
 */

/** The installed runtime this stub is cloned from — in production, the running launcher. */
export type RuntimeApp = {
  /** `/Applications/Midnite Apps.app`. */
  appPath: string;
  /** `Contents/MacOS/<executable>` — `Midnite Apps`. Also the helpers' name prefix. */
  executable: string;
  version: string;
};

export type StubStep =
  | { kind: 'mkdir'; path: string }
  /** APFS clone: `cp -c` for a file, `cp -cR` for a directory. */
  | { kind: 'clone'; from: string; to: string; dir: boolean }
  | { kind: 'rename'; from: string; to: string }
  /** Read `from`, stamp it, write `to` (which may be `from`). */
  | { kind: 'plist'; from: string; to: string; set: Record<string, string>; remove: string[] }
  | { kind: 'exec'; cmd: string; args: string[] };

/** Info.plist keys the runtime has that a stub must not inherit. */
export const STUB_PLIST_REMOVE = [
  // The runtime's own app.asar hash. The stub runs Resources/app (a folder), and a stale
  // integrity entry makes Electron refuse to start.
  'ElectronAsarIntegrity',
  // `midnite://` belongs to the launcher; a stub claiming it would let LaunchServices hand
  // the link router's links to whichever app registered last.
  'CFBundleURLTypes',
  // An asset-catalog icon name would win over CFBundleIconFile and show the launcher's icon.
  'CFBundleIconName',
];

export type StubPlanInput = {
  runtime: RuntimeApp;
  /** `readdir(<runtime>/Contents/Frameworks)` — read by the caller so the plan stays pure. */
  frameworks: readonly string[];
  identity: StubIdentity;
  /** The installed bundle that becomes `Resources/app`. */
  bundlePath: string;
  /** The bundle's version — the stub's `CFBundleShortVersionString`. */
  version: string;
  /** Where to build it (a staging sibling of the final path). */
  stubPath: string;
};

const HELPER_SUFFIX = / Helper( \([A-Za-z]+\))?\.app$/;

export function planStub(input: StubPlanInput): StubStep[] {
  const { runtime, identity, stubPath } = input;
  const src = join(runtime.appPath, 'Contents');
  const dst = join(stubPath, 'Contents');
  const steps: StubStep[] = [
    { kind: 'mkdir', path: join(dst, 'MacOS') },
    { kind: 'mkdir', path: join(dst, 'Resources') },
    { kind: 'mkdir', path: join(dst, 'Frameworks') },
  ];

  for (const entry of [...input.frameworks].sort()) {
    const helper = entry.startsWith(`${runtime.executable} Helper`) ? HELPER_SUFFIX.exec(entry) : null;
    if (helper === null) {
      steps.push({ kind: 'clone', from: join(src, 'Frameworks', entry), to: join(dst, 'Frameworks', entry), dir: true });
      continue;
    }
    // `Midnite Apps Helper (Renderer).app` → `Midnite Cleaner Helper (Renderer).app`
    const suffix = helper[1] ?? '';
    const fromName = `${runtime.executable} Helper${suffix}`;
    const toName = `${identity.executable} Helper${suffix}`;
    const app = join(dst, 'Frameworks', `${toName}.app`);
    const idSuffix = suffix === '' ? '' : `.${suffix.replace(/[ ()]/g, '')}`;
    steps.push(
      { kind: 'clone', from: join(src, 'Frameworks', entry), to: app, dir: true },
      { kind: 'rename', from: join(app, 'Contents', 'MacOS', fromName), to: join(app, 'Contents', 'MacOS', toName) },
      {
        kind: 'plist',
        from: join(app, 'Contents', 'Info.plist'),
        to: join(app, 'Contents', 'Info.plist'),
        set: {
          CFBundleExecutable: toName,
          CFBundleName: toName,
          CFBundleDisplayName: toName,
          CFBundleIdentifier: `${identity.bundleId}.helper${idSuffix}`,
        },
        remove: [],
      },
    );
  }

  steps.push(
    { kind: 'clone', from: join(src, 'MacOS', runtime.executable), to: join(dst, 'MacOS', identity.executable), dir: false },
    {
      kind: 'plist',
      from: join(src, 'Info.plist'),
      to: join(dst, 'Info.plist'),
      set: {
        CFBundleIdentifier: identity.bundleId,
        CFBundleName: identity.displayName,
        CFBundleDisplayName: identity.displayName,
        CFBundleExecutable: identity.executable,
        CFBundleIconFile: 'app.icns',
        CFBundleShortVersionString: input.version,
        CFBundleVersion: input.version,
      },
      remove: [...STUB_PLIST_REMOVE],
    },
    { kind: 'clone', from: join(input.bundlePath, 'icon.icns'), to: join(dst, 'Resources', 'app.icns'), dir: false },
    { kind: 'clone', from: input.bundlePath, to: join(dst, 'Resources', 'app'), dir: true },
    // Ad-hoc: a locally assembled stub has no Developer ID to sign with. Gatekeeper's verdict on
    // that (no quarantine bit, so it launches) is Theme F's to confirm on a clean machine.
    { kind: 'exec', cmd: 'codesign', args: ['--force', '--deep', '--sign', '-', stubPath] },
    { kind: 'exec', cmd: 'codesign', args: ['--verify', '--deep', '--strict', stubPath] },
  );
  return steps;
}

/** The side effects a plan needs — real by default, faked in tests. */
export type StubIo = {
  exec(cmd: string, args: readonly string[]): Promise<void>;
};

export function execFileIo(): StubIo {
  return {
    exec: (cmd, args) =>
      new Promise((resolve, reject) => {
        execFile(cmd, args, (error, _stdout, stderr) =>
          error ? reject(new Error(`${cmd} failed: ${String(stderr).trim() || error.message}`)) : resolve(),
        );
      }),
  };
}

export async function runStubPlan(steps: readonly StubStep[], io: StubIo): Promise<void> {
  for (const step of steps) {
    switch (step.kind) {
      case 'mkdir':
        await mkdir(step.path, { recursive: true });
        break;
      case 'clone':
        // `cp -c` is clonefile(2): copy-on-write on APFS, an error anywhere else (another
        // volume, HFS+). That error is the point — a silent full copy would cost ~230 MB per app.
        await mkdir(dirname(step.to), { recursive: true });
        await io.exec('cp', step.dir ? ['-cR', step.from, step.to] : ['-c', step.from, step.to]);
        break;
      case 'rename':
        await rename(step.from, step.to);
        break;
      case 'plist':
        await writeFile(step.to, stampPlist(await readFile(step.from, 'utf8'), { set: step.set, remove: step.remove }));
        break;
      case 'exec':
        await io.exec(step.cmd, step.args);
        break;
    }
  }
}

/** The runtime's frameworks, for {@link planStub}. */
export function readRuntimeFrameworks(runtime: RuntimeApp): Promise<string[]> {
  return readdir(join(runtime.appPath, 'Contents', 'Frameworks'));
}

/** A structurally complete stub: plist, executable, framework and the bundle inside it. */
export async function verifyStub(stubPath: string, identity: StubIdentity): Promise<string | null> {
  const c = join(stubPath, 'Contents');
  const checks: [string, number, string][] = [
    [join(c, 'Info.plist'), constants.R_OK, 'missing Contents/Info.plist'],
    [join(c, 'MacOS', identity.executable), constants.X_OK, `missing Contents/MacOS/${identity.executable}`],
    [join(c, 'Frameworks', 'Electron Framework.framework'), constants.R_OK, 'missing Electron Framework'],
    [join(c, 'Resources', 'app', 'package.json'), constants.R_OK, 'missing the app bundle'],
  ];
  for (const [path, mode, reason] of checks) {
    try {
      await access(path, mode);
    } catch {
      return reason;
    }
  }
  return null;
}

/** The runtime this process is: `<x>.app/Contents/MacOS/<exe>` → `<x>.app`. `null` outside a bundle (dev). */
export function runtimeFromExecPath(execPath: string, version: string): RuntimeApp | null {
  const macos = dirname(execPath);
  const contents = dirname(macos);
  const appPath = dirname(contents);
  if (basename(macos) !== 'MacOS' || basename(contents) !== 'Contents' || !appPath.endsWith('.app')) return null;
  return { appPath, executable: basename(execPath), version };
}
