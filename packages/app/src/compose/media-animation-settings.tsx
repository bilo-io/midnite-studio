import { SKETCHFAB_TOKEN_URL } from '@midnite/studio-shared';
import { LuExternalLink } from 'react-icons/lu';

import { ApiKeyRow } from '../features/media/image/image-settings';
import { bridge } from '../services/bridge';

/**
 * Settings ▸ Media ▸ Animations (Phase 125 Theme E): your own Sketchfab API token, for the in-app search.
 * Bring your own: the app ships none. The token goes to main's vault; this page only ever learns whether
 * one is set, and main sends it only to api.sketchfab.com.
 */
export function AnimationSettingsSection() {
  return (
    <div className="flex flex-col gap-4 p-3">
      <ApiKeyRow label="Sketchfab" noun="API token" secretKey="media.sketchfabApiToken" />
      <p className="-mt-2 text-[11px] text-muted-foreground">
        Needed to search and download from Sketchfab in Media ▸ Animations. It is free from your Sketchfab account settings. The token stays in the
        app&apos;s encrypted vault and is only ever sent to api.sketchfab.com.
      </p>
      <button
        type="button"
        onClick={() => void bridge()?.shell.openExternal({ url: SKETCHFAB_TOKEN_URL })}
        className="inline-flex w-fit items-center gap-1 text-[11px] text-primary hover:underline"
      >
        Get a token on Sketchfab <LuExternalLink aria-hidden className="size-3" />
      </button>
    </div>
  );
}
