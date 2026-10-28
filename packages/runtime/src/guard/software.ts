import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { InstalledSoftware } from './checks/installed-software';

/** Runs a binary with arguments and returns stdout. The host injects it (no shell, no sudo); a non-zero exit rejects. */
export type ExecFile = (file: string, args: readonly string[]) => Promise<string>;

/** `brew outdated --json=v2`: formulae and casks behind their latest version. Malformed output yields nothing. */
export function parseBrewOutdated(stdout: string): InstalledSoftware[] {
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    return [];
  }
  const out: InstalledSoftware[] = [];
  const root = (json ?? {}) as { formulae?: unknown; casks?: unknown };
  for (const list of [root.formulae, root.casks]) {
    if (!Array.isArray(list)) continue;
    for (const e of list as Array<Record<string, unknown>>) {
      if (typeof e?.['name'] !== 'string') continue;
      const installed = Array.isArray(e['installed_versions']) ? String(e['installed_versions'][0] ?? '') : '';
      if (installed === '') continue;
      out.push({
        source: 'brew',
        name: e['name'],
        version: installed,
        latest: typeof e['current_version'] === 'string' ? e['current_version'] : undefined,
        outdated: true,
      });
    }
  }
  return out;
}

/**
 * Everything the installed-software check looks at: brew's outdated list, each `/Applications` bundle's
 * `CFBundleShortVersionString` and `sw_vers`. A source that fails (no brew installed) is left out; if every source
 * fails the resolver throws, so the sweep records the input as skipped instead of reporting a clean Mac.
 */
export async function resolveInstalledSoftware(exec: ExecFile, applicationsDir = '/Applications'): Promise<InstalledSoftware[]> {
  const out: InstalledSoftware[] = [];
  let sources = 0;
  try {
    out.push(...parseBrewOutdated(await exec('brew', ['outdated', '--json=v2'])));
    sources++;
  } catch {
    // brew not installed
  }
  try {
    const version = (await exec('sw_vers', ['-productVersion'])).trim();
    if (version !== '') out.push({ source: 'macos', name: 'macOS', version });
    sources++;
  } catch {
    // not macOS
  }
  try {
    for (const entry of await readdir(applicationsDir)) {
      if (!entry.endsWith('.app')) continue;
      try {
        const version = (
          await exec('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', join(applicationsDir, entry, 'Contents', 'Info.plist')])
        ).trim();
        if (version !== '') out.push({ source: 'app', name: entry.slice(0, -4), version });
      } catch {
        // a bundle without a version string
      }
    }
    sources++;
  } catch {
    // no /Applications
  }
  if (sources === 0) throw new Error('no software inventory source is available');
  return out;
}
