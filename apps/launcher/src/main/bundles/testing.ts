import { createHash } from 'node:crypto';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { CatalogApp } from '../../common/catalog-feed';
import type { RuntimeApp, StubIo } from './stub';

/**
 * Test fixtures for `bundles/` — a fake runtime `.app`, fake bundle payloads, and a fake
 * {@link StubIo} that does `cp -c`/`ditto` with `fs.cp` and only *records* `codesign`. Imported
 * by tests only; nothing here names a real system path.
 */

export const PLIST = (name: string, id: string): string => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>CFBundleExecutable</key>
\t<string>${name}</string>
\t<key>CFBundleIdentifier</key>
\t<string>${id}</string>
\t<key>CFBundleName</key>
\t<string>${name}</string>
\t<key>CFBundleShortVersionString</key>
\t<string>0.1.0</string>
\t<key>ElectronAsarIntegrity</key>
\t<dict>
\t\t<key>Resources/app.asar</key>
\t\t<dict>
\t\t\t<key>algorithm</key>
\t\t\t<string>SHA256</string>
\t\t\t<key>hash</key>
\t\t\t<string>abc</string>
\t\t</dict>
\t</dict>
\t<key>CFBundleURLTypes</key>
\t<array>
\t\t<dict>
\t\t\t<key>CFBundleURLName</key>
\t\t\t<string>Midnite Apps</string>
\t\t\t<key>CFBundleURLSchemes</key>
\t\t\t<array>
\t\t\t\t<string>midnite</string>
\t\t\t</array>
\t\t</dict>
\t</array>
\t<key>NSPrincipalClass</key>
\t<string>AtomApplication</string>
\t<key>LSUIElement</key>
\t<false/>
</dict>
</plist>
`;

/** A runtime laid out like an electron-builder build of the launcher, a few bytes per file. */
export async function fakeRuntime(dir: string, version = '0.1.0'): Promise<RuntimeApp> {
  const appPath = join(dir, 'Midnite Apps.app');
  const c = join(appPath, 'Contents');
  await mkdir(join(c, 'MacOS'), { recursive: true });
  await writeFile(join(c, 'Info.plist'), PLIST('Midnite Apps', 'io.bilo.midnite-launcher'));
  await writeFile(join(c, 'MacOS', 'Midnite Apps'), 'runtime-binary', { mode: 0o755 });
  const fw = join(c, 'Frameworks', 'Electron Framework.framework', 'Versions', 'A');
  await mkdir(fw, { recursive: true });
  await writeFile(join(fw, 'Electron Framework'), 'framework');
  await mkdir(join(c, 'Frameworks', 'Squirrel.framework'), { recursive: true });
  await writeFile(join(c, 'Frameworks', 'Squirrel.framework', 'Squirrel'), 'squirrel');
  for (const suffix of ['', ' (Renderer)', ' (GPU)']) {
    const name = `Midnite Apps Helper${suffix}`;
    const helper = join(c, 'Frameworks', `${name}.app`, 'Contents');
    await mkdir(join(helper, 'MacOS'), { recursive: true });
    await writeFile(join(helper, 'Info.plist'), PLIST(name, `io.bilo.midnite-launcher.helper`));
    await writeFile(join(helper, 'MacOS', name), 'helper-binary', { mode: 0o755 });
  }
  return { appPath, executable: 'Midnite Apps', version };
}

/** An extracted bundle: `package.json` at `version`, an icon and a main script. */
export async function fakePayload(dir: string, version: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'midnite-cleaner', version, main: 'main.js' }));
  await writeFile(join(dir, 'icon.icns'), 'icns');
  await writeFile(join(dir, 'main.js'), `// cleaner ${version}\n`);
  return dir;
}

/** A catalog entry whose checksum and size match `zipBytes`. */
export function catalogEntry(id: string, version: string, zipBytes: Buffer): CatalogApp {
  return {
    id,
    version,
    bundleUrl: `https://example.invalid/${id}-${version}.zip`,
    size: zipBytes.length,
    sha256: createHash('sha256').update(zipBytes).digest('hex'),
    minimumRuntimeVersion: '0.1.0',
  };
}

/** `fetch` that serves fixed bytes for any URL. */
export function serve(bytes: Buffer, status = 200): typeof fetch {
  return (async () => new Response(new Uint8Array(bytes), { status, headers: { 'content-length': String(bytes.length) } })) as unknown as typeof fetch;
}

export type FakeIo = StubIo & { calls: string[][] };

/**
 * `cp -c[R]` and `ditto` done with `fs.cp`; `codesign` recorded, and failed when `failOn` says so.
 * Recording every call is how the tests assert that nothing ran outside the temp roots.
 */
export function fakeIo(failOn: (cmd: string, args: readonly string[]) => boolean = () => false): FakeIo {
  const calls: string[][] = [];
  return {
    calls,
    async exec(cmd, args) {
      calls.push([cmd, ...args]);
      if (failOn(cmd, args)) throw new Error(`${cmd} failed: simulated`);
      if (cmd === 'cp') {
        const [flag, from, to] = args as [string, string, string];
        await cp(from, to, { recursive: flag === '-cR' });
      } else if (cmd === 'ditto') {
        await cp(args[0] as string, args[1] as string, { recursive: true });
      }
    },
  };
}
