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
import { readFile, writeFile, appendFile } from 'node:fs/promises';
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
  await main();
}
