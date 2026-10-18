import type { CaptureHost } from '@midnite/studio-feature-capture/renderer';
import { useChatsStore } from '@midnite/studio-feature-chats/renderer';
import type { RepoDescriptor } from '@midnite/studio-shared';

import { requestHandoff } from '../services/handoff';
import { keys } from '../services/queries';
import { appQueryClient } from '../services/query-client';
import { useUiStore } from '../store/ui-store';

/**
 * Studio's side of the capture feature's host port (Phase 113 Theme K slice 1).
 *
 * Neither destination sends anything; each only prepares a place the user then acts in.
 *
 * - **`sendToChat`** offers the attachment (a text note naming the capture's path) to chats'
 *   incoming-draft slot, which drops it into a *new* chat's draft, and hands off to Agents ▸ Chats. The
 *   user reads it, writes the prompt and presses send — or removes it.
 * - **`creator`** reads Studio's selected repository at click time (its name from the repos the rail
 *   already fetched), and reveals the imported image through the hand-off's reveal engine — the same
 *   path a `midnite://open` link to a media ref takes.
 *
 * The PR-comment destination is deferred (`PR_COMMENT_DEFERRED` in the feature).
 */
let offered = 0;

export const STUDIO_CAPTURE_HOST: CaptureHost = {
  sendToChat: (attachment) => {
    offered += 1;
    useChatsStore.getState().offerAttachment({
      id: `capture-${Date.now().toString(36)}-${offered}`,
      name: attachment.name,
      text: attachment.text,
    });
    void requestHandoff({ app: 'agents', view: 'chats' });
  },
  creator: {
    repo: () => {
      const id = useUiStore.getState().selectedRepoId;
      if (!id) return null;
      const repos = appQueryClient.getQueryData<RepoDescriptor[]>(keys.repos) ?? [];
      return { id, name: repos.find((r) => r.id === id)?.name ?? id };
    },
    reveal: ({ repoId, project, path }) => {
      void requestHandoff({
        app: 'creator',
        ref: { kind: 'media', repoId, media: 'image', project, path },
      });
    },
  },
};
