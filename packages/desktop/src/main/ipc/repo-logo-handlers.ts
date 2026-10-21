import { CHANNELS, schemas } from '@midnite/studio-shared';

import { findRepoLogo } from '../repo-logo';
import { resolveWorkdir } from '../repo-registry';
import { handle } from './handle';

/** Repo logo for the title-bar breadcrumbs. `{dataUrl: null}` when none is found — never throws. */
export function registerRepoLogoHandlers(): void {
  handle(
    CHANNELS.repoLogo,
    schemas.RepoLogoRequest,
    async (req) => {
      const root = await resolveWorkdir(req.repoId);
      return { dataUrl: root ? await findRepoLogo(root) : null };
    },
    () => ({ dataUrl: null }),
  );
}
