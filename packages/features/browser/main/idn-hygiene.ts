import { domainToASCII, domainToUnicode } from 'node:url';

import { isUniformScript } from '@midnite/studio-shared';

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

/**
 * The one script rule, shared with the address bar's lookalike check (`@midnite/studio-shared`'s
 * `lookalike.ts`, Phase 117 Theme C) so a host never reads as Unicode in one surface and punycode in
 * the other. Han, Hiragana and Katakana count as one writing system there, as Chromium's IDN policy does.
 */
export { isUniformScript };

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
