import { shell } from 'electron';

import { listRemotes } from '@midnite/studio-git-engine';
import { CHANNELS, schemas, type Remote } from '@midnite/studio-shared';

import { resolveWorkdir } from '../repo-registry';
import { handle } from './handle';

/** Remote listing, and the guarded hand-off to the OS browser. */
export function registerRemoteHandlers(): void {
  /**
   * Answers `[]` for an unknown repo rather than failing.
   *
   * The reader is the sidebar and (from Theme A) the linkifier, and neither has
   * anything useful to render for an error — "no remotes" and "that repo went
   * away" produce the same, correct UI: no forge links.
   */
  handle<typeof schemas.RemotesListRequest, Remote[]>(
    CHANNELS.remotesList,
    schemas.RemotesListRequest,
    async (req) => {
      const cwd = await resolveWorkdir(req.repoId);
      if (!cwd) return [];
      return listRemotes(cwd);
    },
    () => [],
  );

  /**
   * Open a URL in the user's browser.
   *
   * Checked twice, on purpose. The schema's `refine` rejects the payload at the
   * boundary like every other handler, and then the URL is re-tested here
   * immediately before the call. That is not redundancy for its own sake: the
   * schema is a data-shape contract that a future edit could widen (adding
   * `.or(z.string())` to accept a fallback, say) without anyone connecting that
   * to `shell.openExternal`, whereas this check sits on the line that does the
   * dangerous thing and cannot be separated from it.
   *
   * `openExternal` hands a scheme to the OS's registered handler for it, so an
   * unfiltered `file://` opens Finder on an arbitrary path and `javascript:`
   * is the classic form. The renderer is our own code, but a linkified commit
   * message is attacker-authored text that arrived in a clone.
   */
  handle(
    CHANNELS.shellOpenExternal,
    schemas.OpenExternalRequest,
    async (req) => {
      // The normalised href, not `req.url` — see normalizeExternalUrl. Passing
      // the caller's raw string on would hand the OS something this check never
      // inspected, since the URL parser strips leading control characters.
      const url = schemas.normalizeExternalUrl(req.url);
      if (url === null) {
        return { ok: false, message: 'Refused: unsupported URL protocol.' };
      }
      try {
        await shell.openExternal(url);
        return { ok: true };
      } catch (error) {
        // The OS having no handler for a scheme is the user's configuration,
        // not a bug worth a dialog — the click simply does nothing.
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
    (issue) => ({ ok: false, message: issue }),
  );
}
