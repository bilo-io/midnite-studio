#!/usr/bin/env node
// Phase 53 Theme E: mirror one release's changelog section from this
// (private) repo's root CHANGELOG.md into the PUBLIC bilo-io/midnite-apps
// mirror that release.ts's RELEASE_CHANGELOG_RAW_URL points the in-app
// release-notes popover at. Run by .github/workflows/release.yml's
// `publish-feed` job, which runs `needs: release` — ordering is load-bearing,
// since the mirror going live before the Release exists would be a feed
// pointing at a 404 for however long the gap lasts.
//
// `extractChangelogSection` is packages/shared/src/release.ts's own helper,
// already covered by its nine tests in release.test.ts; this script reuses
// the BUILT copy (packages/shared/dist/release.js) rather than duplicating
// the parser, so the workflow step that calls this runs `shared:build`
// first. `mirrorSection` below is new logic and is covered by
// publish-feed-changelog.test.mjs, colocated with it.
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const UNRELEASED_HEADING = /^##\s+\[Unreleased\]\s*$/m;
const NEXT_HEADING = /^##\s+/m;
const LINK_REF_LINE = /^\[[^\]]+\]:\s*\S+/;

/**
 * Keep a Changelog parks link-reference definitions (`[X.Y.Z]: url`) as a
 * trailing block, separate from the sections themselves. Split it off so the
 * section-insertion logic below only ever deals with actual content, then
 * the caller re-attaches (and extends) the ref block.
 */
function splitTrailingLinkRefs(markdown) {
  const lines = markdown.split('\n');
  let i = lines.length;
  while (i > 0 && lines[i - 1].trim() === '') i -= 1;
  let refStart = i;
  while (refStart > 0 && LINK_REF_LINE.test(lines[refStart - 1])) refStart -= 1;
  return {
    body: lines.slice(0, refStart).join('\n').trimEnd(),
    refs: lines.slice(refStart, i).join('\n'),
  };
}

/**
 * Insert `version`'s section into `targetMarkdown` (the mirror repo's own
 * CHANGELOG.md), directly **below the whole `## [Unreleased]` section**
 * (heading + its body) so a real blurb under Unreleased is left where it is
 * and the newest *released* version still reads as the first release entry
 * — Keep a Changelog's own convention.
 *
 * Idempotent: a version already present in the target is returned
 * unchanged, since a future `release: edited` re-run (or a manual retry)
 * must not duplicate the section.
 *
 * @param {string} targetMarkdown
 * @param {string} version bare `X.Y.Z`, no leading `v`
 * @param {string} sectionBody the extracted section body (no heading)
 * @param {string} releaseUrl the namespaced release page, for the trailing link ref
 * @param {string} releaseDate `YYYY-MM-DD`
 * @returns {string}
 */
export function mirrorSection(targetMarkdown, version, sectionBody, releaseUrl, releaseDate) {
  const already = new RegExp(`^##\\s+\\[${escapeRegExp(version)}\\]`, 'm');
  if (already.test(targetMarkdown)) {
    return targetMarkdown;
  }

  const { body, refs } = splitTrailingLinkRefs(targetMarkdown);

  const unreleased = UNRELEASED_HEADING.exec(body);
  if (!unreleased) {
    throw new Error(
      'target changelog has no "## [Unreleased]" heading to insert the new section after',
    );
  }

  const afterHeading = unreleased.index + unreleased[0].length;
  const rest = body.slice(afterHeading);
  const nextHeading = NEXT_HEADING.exec(rest);
  const insertAt = afterHeading + (nextHeading ? nextHeading.index : rest.length);

  const before = body.slice(0, insertAt).replace(/\s*$/, '\n\n');
  const after = body.slice(insertAt).replace(/^\s*/, '');
  const newSection = `## [${version}] - ${releaseDate}\n\n${sectionBody.trim()}\n`;
  const newBody = after ? `${before}${newSection}\n${after}` : `${before}${newSection}`;

  const newRefLine = `[${version}]: ${releaseUrl}`;
  const newRefs = refs ? `${refs}\n${newRefLine}` : newRefLine;

  return `${newBody.trimEnd()}\n\n${newRefs}\n`;
}

/** The built shared modules this script reuses; tests inject the source modules instead. */
async function loadShared() {
  const dist = path.join(repoRoot, 'packages/shared/dist');
  const release = await import(path.join(dist, 'release.js'));
  const version = await import(path.join(dist, 'version.js'));
  return { ...release, compareSemVer: version.compareSemVer };
}

const RELEASE_HEADING = /^##\s+\[([^\]]+)\]/gm;

/**
 * Phase 131 Theme C: back-fill every released section of `sourceMarkdown` that
 * `targetMarkdown` lacks. Each missing version is inserted in descending order —
 * directly before the first existing release heading with a lower version, else at
 * the end of the body — and always after the whole `[Unreleased]` section. Idempotent:
 * with nothing missing the input comes back unchanged and `added` is empty.
 *
 * @param {string} targetMarkdown
 * @param {string} sourceMarkdown
 * @param {(version: string) => string} releaseUrlFor
 * @param {string} fallbackDate `YYYY-MM-DD`, for a section whose own heading has none
 * @param {{ extractLatestSections: Function, compareSemVer: Function }} shared
 * @returns {{ markdown: string, added: string[] }}
 */
export function mirrorMissingSections(targetMarkdown, sourceMarkdown, releaseUrlFor, fallbackDate, shared) {
  const { extractLatestSections, compareSemVer } = shared;
  const has = (md, v) => new RegExp(`^##\\s+\\[${escapeRegExp(v)}\\]`, 'm').test(md);
  const missing = extractLatestSections(sourceMarkdown, 1000)
    .filter((section) => !has(targetMarkdown, section.version))
    .sort((x, y) => compareSemVer(y.version, x.version));
  if (missing.length === 0) return { markdown: targetMarkdown, added: [] };

  const split = splitTrailingLinkRefs(targetMarkdown);
  let body = split.body;
  if (!UNRELEASED_HEADING.test(body)) {
    throw new Error('target changelog has no "## [Unreleased]" heading to insert the new section after');
  }
  const added = [];
  const newRefs = [];
  for (const section of missing) {
    const text = `## [${section.version}] - ${section.date ?? fallbackDate}\n\n${section.body.trim()}\n`;
    let insertAt = -1;
    for (const match of body.matchAll(RELEASE_HEADING)) {
      if (/^unreleased$/i.test(match[1])) continue;
      if (compareSemVer(match[1], section.version) < 0) {
        insertAt = match.index;
        break;
      }
    }
    body =
      insertAt < 0
        ? `${body.trimEnd()}\n\n${text}`
        : `${body.slice(0, insertAt).trimEnd()}\n\n${text}\n${body.slice(insertAt)}`;
    added.push(section.version);
    newRefs.push(`[${section.version}]: ${releaseUrlFor(section.version)}`);
  }
  const refs = [split.refs, ...newRefs].filter(Boolean).join('\n');
  return { markdown: `${body.trimEnd()}\n\n${refs}\n`, added };
}

/** What a missing feed file starts as, so `[Unreleased]` exists on an app's first release. */
export function changelogSkeleton(title) {
  return `# Changelog — ${title}\n\n## [Unreleased]\n`;
}

/** Display names for the feed skeleton; pinned to each file's own first line by changelog-files.test.mjs. */
export const CHANGELOG_TITLES = {
  launcher: 'Midnite Apps',
  agents: 'Midnite Agents',
  browser: 'Midnite Browser',
  gamer: 'Midnite Gamer',
  media: 'Midnite Media',
  mind: 'Midnite Mind',
  money: 'Midnite Money',
  science: 'Midnite Science',
  startup: 'Midnite Startup',
  vanguard: 'Midnite Vanguard',
};

/**
 * Mirror every app's changelog except Studio's (which `publish-feed` owns) into `<feedRoot>/midnite-<id>/CHANGELOG.md`.
 * @returns {Promise<{ id: string, added: string[] }[]>}
 */
export async function mirrorAll({ feedRoot, releaseDate, root = repoRoot, shared }) {
  const results = [];
  for (const id of shared.CHANGELOG_APP_IDS) {
    if (id === 'studio') continue;
    const source = await readFile(path.join(root, shared.changelogSourcePath(id)), 'utf8');
    const dir = path.join(feedRoot, shared.changelogFeedDir(id));
    const file = path.join(dir, 'CHANGELOG.md');
    await mkdir(dir, { recursive: true });
    let target;
    try {
      target = await readFile(file, 'utf8');
    } catch {
      target = changelogSkeleton(CHANGELOG_TITLES[id] ?? `Midnite ${id}`);
    }
    const { markdown, added } = mirrorMissingSections(
      target,
      source,
      (v) => shared.appReleasePageUrl(id, v),
      releaseDate,
      shared,
    );
    await writeFile(file, markdown, 'utf8');
    results.push({ id, added });
  }
  return results;
}

async function mainAll() {
  const [, , , version, feedRoot, releaseDate] = process.argv;
  if (!version || !feedRoot || !releaseDate) {
    console.error('usage: publish-feed-changelog.mjs --all <version> <feed-root> <release-date>');
    process.exit(1);
  }
  const shared = await loadShared();
  for (const { id, added } of await mirrorAll({ feedRoot, releaseDate, shared })) {
    console.log(`mirrored ${id}: ${added.length ? added.join(', ') : 'nothing new'}`);
  }
}

async function main() {
  const [, , sourceChangelogPath, version, targetChangelogPath, releaseUrl, releaseDate] =
    process.argv;
  if (!sourceChangelogPath || !version || !targetChangelogPath || !releaseUrl || !releaseDate) {
    console.error(
      'usage: publish-feed-changelog.mjs <source-CHANGELOG.md> <version> <target-CHANGELOG.md> <release-url> <release-date>',
    );
    process.exit(1);
  }

  const { extractChangelogSection } = await import(
    path.join(repoRoot, 'packages/shared/dist/release.js')
  );

  const report = async (line) => {
    const output = process.env.GITHUB_OUTPUT;
    if (output) await appendFile(output, `${line}\n`, 'utf8');
    else process.stdout.write(`${line}\n`);
  };

  const source = await readFile(sourceChangelogPath, 'utf8');
  const sectionBody = extractChangelogSection(source, version);

  if (sectionBody === null) {
    await report('has_section=false');
    console.log(
      `no "## [${version}]" section in ${sourceChangelogPath} yet — nothing to mirror`,
    );
    return;
  }

  const target = await readFile(targetChangelogPath, 'utf8');
  const next = mirrorSection(target, version, sectionBody, releaseUrl, releaseDate);
  await writeFile(targetChangelogPath, next, 'utf8');
  await report('has_section=true');
  console.log(`mirrored "## [${version}]" into ${targetChangelogPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv[2] === '--all') await mainAll();
  else await main();
}
