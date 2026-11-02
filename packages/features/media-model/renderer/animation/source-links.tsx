import { ANIMATION_SOURCE_SITES, animationSourceUrl, isAnimationSourceUrl, type AnimationSourceSite } from '@midnite/studio-shared';
import { LuExternalLink } from 'react-icons/lu';

import { bridge } from '@midnite/studio-frame';

/** Hands a catalogue URL to the system browser through the guarded `shell.openExternal`; anything off the catalogue is refused here. */
export function openAnimationSource(site: AnimationSourceSite, query: string): boolean {
  const url = animationSourceUrl(site, query);
  if (!isAnimationSourceUrl(url)) return false;
  void bridge()?.shell.openExternal({ url });
  return true;
}

/**
 * Phase 125 Theme F: sites with more clips. Each row is a search link that opens in the system browser with the
 * current search text; nothing is fetched by the app. The user imports what they download by drop or folder pick.
 */
export function SourceLinks({ query }: { query: string }) {
  const searching = query.trim().length > 0;
  return (
    <div className="py-1">
      <p className="px-3 py-1 text-[11px] text-muted-foreground">
        Downloaded something? Drop it on the list to import it. These open in your browser; the app does not fetch from them.
      </p>
      <ul aria-label="Find more clips">
        {ANIMATION_SOURCE_SITES.map((site) => (
          <li key={site.id}>
            <button
              type="button"
              onClick={() => openAnimationSource(site, query)}
              aria-label={searching ? `Search on ${site.name}` : `Open ${site.name}`}
              title={`${site.licenceNote}${site.needsAccount ? ' Needs an account.' : ''}`}
              className="flex w-full items-center gap-2 px-3 py-1 text-left text-xs text-foreground/90 transition-colors hover:bg-primary/10"
            >
              <span className="flex-1">{site.name}</span>
              {site.needsAccount ? <span className="text-[10px] text-muted-foreground">account</span> : null}
              <LuExternalLink className="size-3 text-muted-foreground" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
