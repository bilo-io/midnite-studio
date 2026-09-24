import { useEffect } from 'react';

import type { ForgeKind } from '@midnite/studio-shared';

import {
  AGENTS_CATEGORY_ICON,
  WORKSPACE_CATEGORY_ICON,
  categoryIconMaskUrl,
  gitCategoryIcon,
} from './nav-category-icons';

/**
 * Publishes the rail's three category-header icons as CSS custom properties
 * on `document.documentElement` — `styles.css`'s
 * `[aria-controls^="nav-section-"]` rule reads them to decorate
 * `@bilo-io/shell`'s own section-header buttons (see `nav-category-icons.ts`
 * for why the icon rides in via CSS rather than through `NavSection.title`
 * itself). Same idiom as `features/companion/speaker.ts`'s
 * `setCompanionLevel` — a custom property on the root inherits everywhere at
 * once and costs one style invalidation, versus threading a prop through a
 * component tree this app doesn't own.
 *
 * Workspace and Agents never change, so they are written once. Git's forge
 * does change — with the active repo, and the moment its remotes query
 * resolves — so it gets its own effect keyed on `gitForgeKind`.
 */
export function useNavCategoryIconVars(gitForgeKind: ForgeKind | null): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement.style;
    root.setProperty('--nav-workspace-icon', categoryIconMaskUrl(WORKSPACE_CATEGORY_ICON.Icon));
    root.setProperty('--nav-agents-icon', categoryIconMaskUrl(AGENTS_CATEGORY_ICON.Icon));
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const { Icon, color } = gitCategoryIcon(gitForgeKind);
    const root = document.documentElement.style;
    root.setProperty('--nav-git-icon', categoryIconMaskUrl(Icon));
    root.setProperty('--nav-git-icon-color', color);
  }, [gitForgeKind]);
}
