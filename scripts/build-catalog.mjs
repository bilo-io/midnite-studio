#!/usr/bin/env node
// build-catalog — write `catalog.json` for bilo-io/midnite-apps from a release's real files
// (Phase 113 Themes E1 + F2).
//
// The launcher reads `catalog.json` (raw midnite-apps/main) before falling back to
// `midnite-studio/version.json` (`apps/launcher/src/main/feed.ts`), validates it against
// `apps/launcher/src/common/catalog-feed.ts`, and rejects the whole file when any app's version
// differs from `runtimeVersion` (lockstep). So this script takes ONE version — the tag's — stamps it
// on every entry, and computes each entry's size and SHA-256 from the file that was uploaded, never
// from a number someone typed.
//
// Usage (release.yml's `publish-suite` job):
//   node scripts/build-catalog.mjs --version 0.3.1 \
//     --app studio=artifacts/midnite-studio-0.3.1-arm64.zip=https://…/midnite-studio-0.3.1-arm64.zip \
//     [--app <id>=<file>=<url> …] [--released-at <iso>] [--notes-url <url>] --out catalog.json
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER = /^\d+\.\d+\.\d+([-.][0-9A-Za-z.]+)?$/;
const APP_ID = /^[a-z][a-z0-9-]*$/;

/**
 * @param {{ version: string, apps: { id: string, file: string, url: string, version?: string }[],
 *           releasedAt?: string, notesUrl?: string }} input
 * @returns {{ schemaVersion: 1, runtimeVersion: string, apps: object[] }}
 */
export function buildCatalog({ version, apps, releasedAt, notesUrl }) {
  if (!SEMVER.test(version ?? '')) throw new Error(`not a release version: ${version}`);
  if (!apps?.length) throw new Error('a catalog needs at least one app');
  const seen = new Set();
  const entries = apps.map((app) => {
    if (!APP_ID.test(app.id)) throw new Error(`bad app id: ${app.id}`);
    if (seen.has(app.id)) throw new Error(`app listed twice: ${app.id}`);
    seen.add(app.id);
    if (app.version !== undefined && app.version !== version) {
      throw new Error(`lockstep: ${app.id} is ${app.version}, the release is ${version}`);
    }
    if (!app.url?.startsWith('https://')) throw new Error(`${app.id}: bundle URL must be https`);
    const bytes = readFileSync(app.file);
    const size = statSync(app.file).size;
    if (size === 0) throw new Error(`${app.id}: ${app.file} is empty`);
    return {
      id: app.id,
      version,
      bundleUrl: app.url,
      size,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      minimumRuntimeVersion: version,
      ...(releasedAt ? { releasedAt } : {}),
      ...(notesUrl ? { notesUrl } : {}),
    };
  });
  return { schemaVersion: 1, runtimeVersion: version, apps: entries };
}

/** `--app id=file=url` — split on the first two `=` only, since a URL may carry its own. */
export function parseAppArg(arg) {
  const first = arg.indexOf('=');
  const second = arg.indexOf('=', first + 1);
  if (first < 1 || second < 0) throw new Error(`--app expects <id>=<file>=<url>, got: ${arg}`);
  return { id: arg.slice(0, first), file: arg.slice(first + 1, second), url: arg.slice(second + 1) };
}

export function parseArgs(argv) {
  const out = { apps: [] };
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (value === undefined) throw new Error(`${flag} needs a value`);
    if (flag === '--version') out.version = value.replace(/^v/, '');
    else if (flag === '--app') out.apps.push(parseAppArg(value));
    else if (flag === '--released-at') out.releasedAt = value;
    else if (flag === '--notes-url') out.notesUrl = value;
    else if (flag === '--out') out.out = value;
    else throw new Error(`unknown flag: ${flag}`);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { out, ...input } = parseArgs(process.argv.slice(2));
    const json = `${JSON.stringify(buildCatalog(input), null, 2)}\n`;
    if (out) writeFileSync(out, json);
    else process.stdout.write(json);
  } catch (err) {
    console.error(`build-catalog: ${err.message}`);
    process.exit(1);
  }
}
