#!/usr/bin/env node
// changelog-sections-check <version> [repo-root] (Phase 131 Theme B)
// Warns (never fails) for each app changelog with no `## [<version>]` section, since that app's
// in-app notes would be empty. Reads the BUILT shared (packages/shared/dist/release.js), like
// publish-feed-changelog.mjs, so `shared:build` runs first in the workflow.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {string} version
 * @param {{ root?: string, ids?: string[], shared?: { extractChangelogSection: Function, CHANGELOG_APP_IDS: string[], changelogSourcePath: Function } }} [options]
 * @returns {Promise<string[]>} one `::warning::` line per file lacking the section
 */
export async function sectionWarnings(version, options = {}) {
  const root = options.root ?? repoRoot;
  const shared =
    options.shared ?? (await import(pathToFileURL(path.join(repoRoot, 'packages/shared/dist/release.js')).href));
  const warnings = [];
  for (const id of options.ids ?? shared.CHANGELOG_APP_IDS) {
    const rel = shared.changelogSourcePath(id);
    let text = null;
    try {
      text = await readFile(path.join(root, rel), 'utf8');
    } catch {
      text = null;
    }
    if (text === null || shared.extractChangelogSection(text, version) === null) {
      warnings.push(`::warning::${rel} has no section for ${version}; its in-app notes will be empty`);
    }
  }
  return warnings;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const version = process.argv[2];
  if (!version) {
    console.error('usage: node scripts/changelog-sections-check.mjs <version> [repo-root]');
    process.exit(1);
  }
  for (const line of await sectionWarnings(version, { root: process.argv[3] ?? repoRoot })) console.log(line);
}
