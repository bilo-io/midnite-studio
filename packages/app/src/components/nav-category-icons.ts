import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BsRobot } from 'react-icons/bs';
import { MdOutlineWorkspaces } from 'react-icons/md';
import { SiGit } from 'react-icons/si';

import type { ForgeKind } from '@midnite/studio-shared';

import type { IconComponent } from './icon-button';
import {
  PROVIDER_BRAND_COLOR,
  PROVIDER_ICON,
  type SupportedKind,
} from '../features/settings/settings-pages/accounts-page';

/**
 * One glyph + colour per rail category header (ad hoc: sidenav category
 * icons) — Workspace, Git and Agents, the three `sections` keys `app.tsx`
 * hands `@bilo-io/shell`'s `AppFrame`.
 *
 * Git's glyph is the active repo's forge, reusing `PROVIDER_ICON`/
 * `PROVIDER_BRAND_COLOR` from the Accounts settings page (Phase 90 Theme B)
 * rather than a second icon/colour table — those already carry the exact
 * brand marks and hex values this ask wants (GitLab `#FC6D26`, Bitbucket
 * `#0052CC`, Azure DevOps `#0078D7`), and `forge-connect-step.tsx` already
 * sets the precedent for importing them into a different feature. GitHub is
 * the one deliberate divergence: Accounts swaps a light/dark hex pair
 * (`#181717`/`#f0f6fc`) so its near-black mark still reads on both themes,
 * but the rail glyph just wants "the same colour as the label beside it", so
 * it uses `currentColor` instead — one property, no theme branching, and it
 * never goes invisible because it's never a fixed colour against a fixed
 * background.
 */
export type CategoryIcon = { readonly Icon: IconComponent; readonly color: string };

/** No remote, or a remote pointing at a forge this app doesn't recognise
 *  (`ForgeKind`'s `'unknown'`, or no repo selected at all) — Git's own logo,
 *  Simple Icons' brand orange. Never "no icon": a category header always
 *  wears one. */
const GIT_FALLBACK_ICON: CategoryIcon = { Icon: SiGit, color: '#F05032' };

/** The Git category header's icon for the active repo's forge — `null` for
 *  "no repo selected" and `ForgeKind`'s own `'unknown'` both fall back to
 *  the plain Git mark, which is the point of `'unknown'` being a first-class
 *  answer rather than an error case (`shared/src/domain/remote.ts`). */
export function gitCategoryIcon(kind: ForgeKind | null): CategoryIcon {
  if (kind === null || kind === 'unknown') return GIT_FALLBACK_ICON;
  const supported = kind as SupportedKind;
  return {
    Icon: PROVIDER_ICON[supported],
    color: supported === 'github' ? 'currentColor' : PROVIDER_BRAND_COLOR[supported].light,
  };
}

/** The same mark `LiveAgentCount` wears in the title bar's agent cluster
 *  (`features/agent/agent-count.tsx`) — one robot glyph for "agents"
 *  wherever the app names them, reused rather than a second import of it. */
export const AGENTS_CATEGORY_ICON: CategoryIcon = { Icon: BsRobot, color: 'currentColor' };

/** Per the ask: `MdOutlineWorkspaces`, plain foreground — this category has
 *  no brand to match, unlike Git's. */
export const WORKSPACE_CATEGORY_ICON: CategoryIcon = {
  Icon: MdOutlineWorkspaces,
  color: 'currentColor',
};

/**
 * A category icon's glyph, rendered once to a CSS `mask-image` data URL.
 *
 * `@bilo-io/shell`'s `NavSection.title` is typed (and, reading its compiled
 * `AppFrame`, actually used) as a plain string: the same value backs the
 * expanded label, the collapsed toggle button's `aria-label`, and the
 * collapsible region's `aria-label` — three accessible-name slots, not one
 * decorative one. Handing it a `ReactNode` would satisfy the visible label
 * but corrupt the other two (a screen reader reading `[object Object]`), so
 * this app cannot put the glyph inside `title` without forking a package it
 * doesn't own. Instead the icon rides in decoratively, as a `::before` on
 * the header button itself — `styles.css`'s `[aria-controls^="nav-section-"]`
 * rule — which is invisible to assistive tech by construction and leaves
 * `title` exactly as it was.
 *
 * Solid black (`#000`) regardless of the category's real colour: a CSS mask
 * only reads its source's alpha channel, so shape and colour are decoupled
 * on purpose — `styles.css` paints the real colour via `background-color`
 * from a second custom property, which is what lets Git's icon recolour
 * itself when the active repo's forge changes without re-rendering the SVG.
 */
export function categoryIconMaskUrl(Icon: IconComponent): string {
  // `style`, not a `color` prop: `IconComponent` is declared structurally
  // (see icon-button.tsx) against every icon set's shared shape, which is
  // `className`/`strokeWidth`/`style` only — react-icons' own SVGs default to
  // `fill="currentColor"`, so setting `color` via `style` is how every other
  // consumer of this narrower type recolours one too.
  const markup = renderToStaticMarkup(createElement(Icon, { style: { color: '#000' } }));
  return `url("data:image/svg+xml,${encodeURIComponent(markup)}")`;
}
