import { normalizeExternalUrl } from './ipc/schemas';

/**
 * Phase 125 Theme F: the sites that have animation clips the app does not fetch itself.
 *
 * Every entry is a **search link** that opens in the system browser; the app never requests, parses or
 * scrapes these sites. The user downloads what they want there and imports it by drop or folder pick.
 * (Sketchfab is not here: it has an official API and is Theme E.)
 */
export interface AnimationSourceSite {
  id: string;
  name: string;
  /** Bare host the search link points at; also the allow-list entry for {@link isAnimationSourceUrl}. */
  host: string;
  /** `{q}` is replaced with the percent-encoded query. */
  searchUrl: string;
  /** Opened when the search box is empty. */
  homeUrl: string;
  /** One line on what the site is and what its licence usually means. */
  licenceNote: string;
  needsAccount: boolean;
}

export const ANIMATION_SOURCE_SITES: readonly AnimationSourceSite[] = [
  {
    id: 'mixamo',
    name: 'Mixamo',
    host: 'www.mixamo.com',
    searchUrl: 'https://www.mixamo.com/#/?page=1&type=Motion%2CMotionPack&query={q}',
    homeUrl: 'https://www.mixamo.com/',
    licenceNote: 'Free with an Adobe account; Adobe terms allow use in games, not redistribution of the clips.',
    needsAccount: true,
  },
  {
    id: 'quaternius',
    name: 'Quaternius',
    host: 'quaternius.com',
    searchUrl: 'https://quaternius.com/search.html?q={q}',
    homeUrl: 'https://quaternius.com/',
    licenceNote: 'CC0 packs of animated characters.',
    needsAccount: false,
  },
  {
    id: 'poly-pizza',
    name: 'Poly Pizza',
    host: 'poly.pizza',
    searchUrl: 'https://poly.pizza/search/{q}',
    homeUrl: 'https://poly.pizza/',
    licenceNote: 'CC0 and CC-BY low-poly models, some animated.',
    needsAccount: false,
  },
  {
    id: 'opengameart',
    name: 'OpenGameArt',
    host: 'opengameart.org',
    searchUrl: 'https://opengameart.org/art-search-advanced?keys={q}&field_art_type_tid%5B%5D=10',
    homeUrl: 'https://opengameart.org/',
    licenceNote: 'Mixed licences (CC0, CC-BY, GPL); check each entry.',
    needsAccount: false,
  },
  {
    id: 'actorcore',
    name: 'ActorCore (free)',
    host: 'actorcore.reallusion.com',
    searchUrl: 'https://actorcore.reallusion.com/3d-motion?search={q}&price=free',
    homeUrl: 'https://actorcore.reallusion.com/3d-motion',
    licenceNote: 'Free motions need a Reallusion account; Reallusion licence.',
    needsAccount: true,
  },
  {
    id: 'cmu-mocap',
    name: 'CMU mocap (BVH)',
    host: 'mocap.cs.cmu.edu',
    searchUrl: 'https://mocap.cs.cmu.edu/search.php?motion={q}',
    homeUrl: 'https://mocap.cs.cmu.edu/',
    licenceNote: 'Free for any use; BVH conversions are mirrored elsewhere.',
    needsAccount: false,
  },
  {
    id: 'turbosquid',
    name: 'TurboSquid',
    host: 'www.turbosquid.com',
    searchUrl: 'https://www.turbosquid.com/Search/3D-Models/free?keyword={q}%20animated',
    homeUrl: 'https://www.turbosquid.com/Search/3D-Models/free/animated',
    licenceNote: 'Free models carry the TurboSquid licence or a CC licence per item.',
    needsAccount: true,
  },
  {
    id: 'cgtrader',
    name: 'CGTrader',
    host: 'www.cgtrader.com',
    searchUrl: 'https://www.cgtrader.com/free-3d-models?keywords={q}&animated=1',
    homeUrl: 'https://www.cgtrader.com/free-3d-models/animated',
    licenceNote: 'Free models carry a royalty-free or CC licence per item.',
    needsAccount: true,
  },
];

/** The URL to open for a site: the search link for a non-empty query, else the site's home. */
export function animationSourceUrl(site: AnimationSourceSite, query: string): string {
  const q = query.trim();
  return q ? site.searchUrl.replace('{q}', encodeURIComponent(q)) : site.homeUrl;
}

/** True only for an https URL on one of the catalogue's hosts. The opener re-checks this before it hands off. */
export function isAnimationSourceUrl(url: string): boolean {
  const href = normalizeExternalUrl(url);
  if (!href) return false;
  const parsed = new URL(href);
  return parsed.protocol === 'https:' && ANIMATION_SOURCE_SITES.some((site) => site.host === parsed.hostname);
}
