import type { VulnerableLibrary } from '@midnite/studio-shared';

/**
 * Known-vulnerable JavaScript libraries, recognised from a script's URL (Phase 117 Theme C).
 *
 * retire.js-style: the library and version are read off the URL alone — the CDN path
 * (`/ajax/libs/jquery/1.12.4/`, `/npm/lodash@4.17.15/`) or the file name (`jquery-1.12.4.min.js`)
 * — never from the script body, which would mean reading a page's bytes in main for every load.
 * A self-hosted bundle with no version in its URL is simply not recognised; that is the trade for
 * a check that costs one regex per script and reads nothing the page did not already announce.
 *
 * {@link ADVISORY_SNAPSHOT} is the offline advisory table those pairs are looked up in: a curated
 * subset of OSV (the database Phase 91 I's `scripts/audit.mjs` consults), bundled and refreshed
 * with the app, never fetched — so the check is local-only and on by default. Advisory only: a
 * hit adds a line to the badge, it never blocks the script.
 */

/** When the snapshot below was last reconciled against OSV. Bump it with every table edit. */
export const ADVISORY_SNAPSHOT_DATE = '2026-10-22';

type Range = { /** inclusive */ from?: string; /** exclusive */ below: string; ids: string[] };

type LibraryAdvisories = {
  /** Every spelling a CDN path or file name uses for the library, longest first where they nest. */
  aliases: string[];
  /** Restricts recognition to these majors (the `angular` npm name is AngularJS 1.x only). */
  majors?: number[];
  ranges: Range[];
  /** Exact releases that were themselves malicious (account takeovers), not merely buggy. */
  malicious?: Record<string, string[]>;
};

export const ADVISORY_SNAPSHOT: Record<string, LibraryAdvisories> = {
  jquery: {
    aliases: ['jquery'],
    ranges: [
      { from: '1.0.3', below: '3.5.0', ids: ['CVE-2020-11023'] },
      { from: '1.2.0', below: '3.5.0', ids: ['CVE-2020-11022'] },
      { below: '3.4.0', ids: ['CVE-2019-11358'] },
      { below: '3.0.0', ids: ['CVE-2015-9251'] },
      { below: '1.9.0', ids: ['CVE-2012-6708'] },
      { below: '1.6.3', ids: ['CVE-2011-4969'] },
    ],
  },
  'jquery-ui': {
    aliases: ['jquery-ui-dist', 'jquery-ui', 'jqueryui', 'jquery.ui'],
    ranges: [
      { below: '1.13.2', ids: ['CVE-2022-31160'] },
      { below: '1.13.0', ids: ['CVE-2021-41184', 'CVE-2021-41183', 'CVE-2021-41182'] },
      { below: '1.12.0', ids: ['CVE-2016-7103'] },
    ],
  },
  angularjs: {
    aliases: ['angular.js', 'angularjs', 'angular'],
    majors: [1],
    // AngularJS is end-of-life: the 2022–2023 advisories have no fixed 1.x release.
    ranges: [
      { from: '1.0.0', below: '2.0.0', ids: ['CVE-2023-26118', 'CVE-2023-26117', 'CVE-2023-26116', 'CVE-2022-25869'] },
      { below: '1.8.0', ids: ['CVE-2020-7676'] },
      { below: '1.7.9', ids: ['CVE-2019-10768'] },
    ],
  },
  lodash: {
    aliases: ['lodash.js', 'lodash'],
    ranges: [
      { below: '4.17.21', ids: ['CVE-2021-23337', 'CVE-2020-28500'] },
      { below: '4.17.19', ids: ['CVE-2020-8203'] },
      { below: '4.17.12', ids: ['CVE-2019-10744'] },
      { below: '4.17.11', ids: ['CVE-2018-16487'] },
    ],
  },
  bootstrap: {
    aliases: ['twitter-bootstrap', 'bootstrap'],
    ranges: [
      { from: '4.0.0', below: '4.3.1', ids: ['CVE-2019-8331'] },
      { below: '3.4.1', ids: ['CVE-2019-8331'] },
      { below: '3.4.0', ids: ['CVE-2018-14042', 'CVE-2018-14041', 'CVE-2018-14040'] },
    ],
  },
  moment: {
    aliases: ['moment.js', 'moment'],
    ranges: [
      { from: '2.18.0', below: '2.29.4', ids: ['CVE-2022-31129'] },
      { below: '2.29.2', ids: ['CVE-2022-24785'] },
      { below: '2.19.3', ids: ['CVE-2017-18214'] },
    ],
  },
  handlebars: {
    aliases: ['handlebars.js', 'handlebars'],
    ranges: [
      { below: '4.7.7', ids: ['CVE-2021-23383', 'CVE-2021-23369'] },
      { below: '4.3.0', ids: ['CVE-2019-19919'] },
    ],
  },
  underscore: {
    aliases: ['underscore.js', 'underscore'],
    ranges: [{ from: '1.3.2', below: '1.12.1', ids: ['CVE-2021-23358'] }],
  },
  dompurify: {
    aliases: ['dompurify'],
    ranges: [
      { from: '3.0.0', below: '3.1.3', ids: ['CVE-2024-45801'] },
      { below: '2.5.4', ids: ['CVE-2024-45801'] },
    ],
  },
  knockout: {
    aliases: ['knockout'],
    ranges: [{ below: '3.5.0', ids: ['CVE-2019-14862'] }],
  },
  // The 2025-09-08 npm account takeover that preceded Shai-Hulud: these exact releases shipped a
  // crypto-wallet hijacker and were pulled within hours, but CDNs that cached them still serve them.
  chalk: { aliases: ['chalk'], ranges: [], malicious: { '5.6.1': ['MALICIOUS-RELEASE-2025-09-08'] } },
  debug: { aliases: ['debug'], ranges: [], malicious: { '4.4.2': ['MALICIOUS-RELEASE-2025-09-08'] } },
};

const ALIAS_TO_LIBRARY = new Map<string, string>();
for (const [library, entry] of Object.entries(ADVISORY_SNAPSHOT)) {
  for (const alias of entry.aliases) ALIAS_TO_LIBRARY.set(alias, library);
}

/** Numeric `major.minor.patch` compare; a pre-release tag is ignored (treated as its release). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[-+]/)[0]!.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(/[-+]/)[0]!.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

const VERSION = String.raw`v?(\d+\.\d+\.\d+(?:-[\w.]+)?)`;
/** `/npm/lodash@4.17.15/…`, `unpkg.com/jquery@3.4.1/…`, `esm.sh/moment@2.29.1`. */
const NPM_STYLE = new RegExp(String.raw`/(?:npm/)?((?:@[\w.-]+/)?[\w.-]+)@${VERSION}(?:/|$)`);
/** `/ajax/libs/jquery/1.12.4/…` (cdnjs, Google Hosted Libraries). */
const AJAX_LIBS = new RegExp(String.raw`/ajax/libs/([\w.-]+)/${VERSION}/`);
/** `/bootstrap/3.3.7/js/…` (BootstrapCDN, jsDelivr gh, self-hosted vendor folders). */
const PATH_SEGMENT = new RegExp(String.raw`/([\w.-]+)/${VERSION}/`, 'g');
/** `jquery-1.12.4.min.js`, `jquery.ui-1.11.4.custom.min.js`, `moment-2.18.1.js`. */
const FILE_NAME = new RegExp(String.raw`^([\w.-]+?)[.-]${VERSION}(?:[.-](?:min|slim|custom|pack|prod|production))*\.js$`);

function libraryFor(name: string, version: string): string | null {
  const library = ALIAS_TO_LIBRARY.get(name.toLowerCase());
  if (!library) return null;
  const majors = ADVISORY_SNAPSHOT[library]!.majors;
  if (majors && !majors.includes(Number.parseInt(version, 10))) return null;
  return library;
}

/** Reads a known library and its version off a script URL, or `null`. */
export function identifyLibrary(url: string): { library: string; version: string } | null {
  let path: string;
  try {
    path = decodeURIComponent(new URL(url).pathname);
  } catch {
    return null;
  }
  const candidates: Array<[string, string]> = [];
  const npm = NPM_STYLE.exec(path);
  if (npm) candidates.push([npm[1]!, npm[2]!]);
  const ajax = AJAX_LIBS.exec(path);
  if (ajax) candidates.push([ajax[1]!, ajax[2]!]);
  for (const match of path.matchAll(PATH_SEGMENT)) candidates.push([match[1]!, match[2]!]);
  const file = FILE_NAME.exec(path.slice(path.lastIndexOf('/') + 1));
  if (file) candidates.push([file[1]!, file[2]!]);
  for (const [name, version] of candidates) {
    const library = libraryFor(name, version);
    if (library) return { library, version };
  }
  return null;
}

/** The advisory ids a release is affected by, deduplicated, in table order. */
export function advisoriesFor(library: string, version: string): string[] {
  const entry = ADVISORY_SNAPSHOT[library];
  if (!entry) return [];
  const ids: string[] = [...(entry.malicious?.[version] ?? [])];
  for (const range of entry.ranges) {
    if (range.from && compareVersions(version, range.from) < 0) continue;
    if (compareVersions(version, range.below) >= 0) continue;
    for (const id of range.ids) if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** The `SiteVerdict.vulnerableLibs` entry for a script URL, or `null` when it is not a known-bad release. */
export function vulnerableLibraryForUrl(url: string): VulnerableLibrary | null {
  const found = identifyLibrary(url);
  if (!found) return null;
  const cve = advisoriesFor(found.library, found.version);
  return cve.length > 0 ? { ...found, cve, url } : null;
}
