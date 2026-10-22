import { domainToASCII, domainToUnicode } from 'node:url';

/**
 * IDN uniform script and homograph hygiene (Phase 117 Theme B & C).
 *
 * An IDN domain label is uniform script if all characters in the label belong to the
 * same Unicode script (e.g. all Latin, all Cyrillic, all Greek, all Arabic), ignoring
 * Common/Inherited characters such as digits and hyphens.
 *
 * If a label mixes scripts (such as Latin 'p' and Cyrillic 'а', like `аpple.com` from `xn--pple-43d.com`),
 * it is a homograph/confusable risk and must be displayed as punycode (`domainToASCII`),
 * never converted to Unicode.
 */

const KNOWN_SCRIPTS = [
  'Latin',
  'Cyrillic',
  'Greek',
  'Arabic',
  'Hebrew',
  'Han',
  'Hiragana',
  'Katakana',
  'Devanagari',
  'Bengali',
  'Gurmukhi',
  'Gujarati',
  'Oriya',
  'Tamil',
  'Telugu',
  'Kannada',
  'Malayalam',
  'Sinhala',
  'Thai',
  'Lao',
  'Tibetan',
  'Myanmar',
  'Georgian',
  'Ethiopic',
  'Cherokee',
  'Ogham',
  'Runic',
  'Khmer',
  'Mongolian',
  'Armenian',
];

const SCRIPT_REGEXES = KNOWN_SCRIPTS.map((name) => ({
  name,
  regex: new RegExp(`^\\p{sc=${name}}$`, 'u'),
}));

const COMMON_OR_INHERITED = /^[\p{sc=Common}\p{sc=Inherited}]$/u;

export function isUniformScript(label: string): boolean {
  let script: string | null = null;
  for (const ch of label) {
    if (COMMON_OR_INHERITED.test(ch)) continue;
    let found: string | null = null;
    for (const { name, regex } of SCRIPT_REGEXES) {
      if (regex.test(ch)) {
        found = name;
        break;
      }
    }
    if (!found) continue;
    if (script === null) {
      script = found;
    } else if (script !== found) {
      return false;
    }
  }
  return true;
}

export function formatHostForDisplay(host: string): string {
  const unicodeHost = domainToUnicode(host);
  const labels = unicodeHost.split('.');
  for (const label of labels) {
    if (!isUniformScript(label)) {
      return domainToASCII(host);
    }
  }
  return unicodeHost;
}

export function formatOriginForDisplay(origin: string): string {
  try {
    const url = new URL(origin);
    const host = formatHostForDisplay(url.hostname);
    const portPart = url.port ? `:${url.port}` : '';
    return `${url.protocol}//${host}${portPart}`;
  } catch {
    return formatHostForDisplay(origin);
  }
}
