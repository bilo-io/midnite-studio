import type { StubStep } from './stub';

/**
 * `launcher:start`'s dev stub — a clone of the stock `Electron.app` that wears the launcher's
 * own name and icon, so the dev Dock reads "Midnite Apps" instead of "Electron" (LaunchServices
 * reads the label and icon from the bundle the process runs out of, which `app.setName` cannot
 * change). Pure and import-free at runtime so `scripts/dev-app.mjs` can load it under node's
 * type stripping, and so the plan is a unit test on any OS. The production stub planner
 * (`stub.ts`) clones a *runtime* into a *bundle*; this one only re-badges Electron in place.
 */

export const DEV_STUB_NAME = 'Midnite Apps';
/** Distinct from production (`io.bilo.midnite-launcher`) and from every app stub (`io.bilo.midnite-<id>`). */
export const DEV_STUB_BUNDLE_ID = 'io.bilo.midnite-launcher.dev';
const STOCK_EXECUTABLE = 'Electron';
const HELPER_SUFFIX = / Helper( \([A-Za-z]+\))?\.app$/;
/** Same keys as the production stub drops; stock Electron has none, so this is belt and braces. */
const PLIST_REMOVE = ['ElectronAsarIntegrity', 'CFBundleURLTypes', 'CFBundleIconName'];

export type DevStubInput = {
  /** `node_modules/electron/dist/Electron.app`. */
  electronApp: string;
  /** `readdir(<electronApp>/Contents/Frameworks)`. */
  frameworks: readonly string[];
  /** `apps/launcher/resources/icon.icns`. */
  icon: string;
  /** `<out>/Midnite Apps.app`. */
  stubPath: string;
};

const join = (...p: string[]): string => p.join('/').replace(/\/{2,}/g, '/');

export function planDevStub(input: DevStubInput): StubStep[] {
  const src = join(input.electronApp, 'Contents');
  const dst = join(input.stubPath, 'Contents');
  const steps: StubStep[] = [
    { kind: 'clone', from: input.electronApp, to: input.stubPath, dir: true },
  ];
  for (const entry of [...input.frameworks].sort()) {
    const helper = entry.startsWith(`${STOCK_EXECUTABLE} Helper`) ? HELPER_SUFFIX.exec(entry) : null;
    if (helper === null) continue;
    const suffix = helper[1] ?? '';
    const fromName = `${STOCK_EXECUTABLE} Helper${suffix}`;
    const toName = `${DEV_STUB_NAME} Helper${suffix}`;
    const oldApp = join(dst, 'Frameworks', entry);
    const app = join(dst, 'Frameworks', `${toName}.app`);
    const idSuffix = suffix === '' ? '' : `.${suffix.replace(/[ ()]/g, '')}`;
    steps.push(
      { kind: 'rename', from: oldApp, to: app },
      { kind: 'rename', from: join(app, 'Contents', 'MacOS', fromName), to: join(app, 'Contents', 'MacOS', toName) },
      {
        kind: 'plist',
        from: join(app, 'Contents', 'Info.plist'),
        to: join(app, 'Contents', 'Info.plist'),
        set: {
          CFBundleExecutable: toName,
          CFBundleName: toName,
          CFBundleDisplayName: toName,
          CFBundleIdentifier: `${DEV_STUB_BUNDLE_ID}.helper${idSuffix}`,
        },
        remove: [],
      },
    );
  }
  steps.push(
    { kind: 'rename', from: join(dst, 'MacOS', STOCK_EXECUTABLE), to: join(dst, 'MacOS', DEV_STUB_NAME) },
    {
      kind: 'plist',
      from: join(src, 'Info.plist'),
      to: join(dst, 'Info.plist'),
      set: {
        CFBundleIdentifier: DEV_STUB_BUNDLE_ID,
        CFBundleName: DEV_STUB_NAME,
        CFBundleDisplayName: DEV_STUB_NAME,
        CFBundleExecutable: DEV_STUB_NAME,
        CFBundleIconFile: 'app.icns',
      },
      remove: [...PLIST_REMOVE],
    },
    { kind: 'clone', from: input.icon, to: join(dst, 'Resources', 'app.icns'), dir: false },
    { kind: 'exec', cmd: 'codesign', args: ['--force', '--deep', '--sign', '-', input.stubPath] },
    { kind: 'exec', cmd: 'codesign', args: ['--verify', '--deep', '--strict', input.stubPath] },
  );
  return steps;
}

/** What a rebuild depends on: Electron's version and the icon's bytes. Equal stamps mean up to date. */
export function devStubStamp(electronVersion: string, iconHash: string): string {
  return `electron=${electronVersion}\nicon=${iconHash}\n`;
}
