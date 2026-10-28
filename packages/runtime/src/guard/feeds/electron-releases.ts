import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { FeedFetch } from './osv';

/** Electron's release index (the one `scripts/electron-freshness.mjs` reads): every published version, newest first. */
export const ELECTRON_RELEASES_URL = 'https://electronjs.org/headers/index.json';

/** The three highest majors in the release index: the ones Electron backports security fixes to. */
export function supportedElectronMajors(releases: unknown): number[] {
  if (!Array.isArray(releases)) return [];
  const majors = new Set<number>();
  for (const r of releases) {
    const m = /^(\d+)\./.exec(String((r as { version?: unknown } | null)?.version ?? ''));
    if (m) majors.add(Number(m[1]));
  }
  return [...majors].sort((a, b) => b - a).slice(0, 3);
}

export interface ElectronMajorsOptions {
  fetch: FeedFetch;
  /** `<userData>/security/feeds/electron`. */
  cacheDir: string;
}

/**
 * The supported Electron majors. A failed download falls back to the last cached answer; with neither it throws, so
 * the sweep records the input as skipped rather than judging every pin against an empty window.
 */
export async function loadElectronMajors(options: ElectronMajorsOptions): Promise<number[]> {
  const file = join(options.cacheDir, 'majors.json');
  try {
    const res = await options.fetch(ELECTRON_RELEASES_URL);
    if (res.ok) {
      const majors = supportedElectronMajors(await res.json());
      if (majors.length > 0) {
        try {
          await mkdir(options.cacheDir, { recursive: true, mode: 0o700 });
          await writeFile(`${file}.tmp`, JSON.stringify(majors), 'utf8');
          await rename(`${file}.tmp`, file);
        } catch {
          // cache is best-effort
        }
        return majors;
      }
    }
  } catch {
    // network failure: fall through to the cache
  }
  try {
    const cached = JSON.parse(await readFile(file, 'utf8')) as unknown;
    if (Array.isArray(cached) && cached.every((n) => typeof n === 'number') && cached.length > 0) return cached as number[];
  } catch {
    // no cache
  }
  throw new Error('the Electron release index is unavailable');
}
