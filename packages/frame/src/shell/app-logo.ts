import type { SuiteAppId } from '@midnite/studio-shared';

/**
 * Each app's logo for its own window — a byte copy of the launcher's 256 px tile, written by
 * `moon run launcher:logos` (`generate-app-logos.cjs`) and held to it by `app-logo.test.ts`.
 * Same lookup as the launcher's `app-icon.tsx`.
 */
const LOGOS = import.meta.glob<string>('./app-logos/*.png', { eager: true, import: 'default' });

export function appLogoUrl(id: SuiteAppId): string {
  const url = LOGOS[`./app-logos/${id}.png`];
  if (url === undefined) throw new Error(`No logo for suite app "${id}" — run \`moon run launcher:logos\`.`);
  return url;
}
