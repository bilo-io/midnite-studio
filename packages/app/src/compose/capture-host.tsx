import type { CaptureHost, CapturePrCommentHost } from '@midnite/studio-feature-capture/renderer';
import { useChatsStore } from '@midnite/studio-feature-chats/renderer';
import { FORGE_STALE_MS, forgeKeys } from '@midnite/studio-feature-forge/renderer';
import type { ForgePullsResult, RepoDescriptor } from '@midnite/studio-shared';

import { bridge } from '../services/bridge';
import { requestHandoff } from '../services/handoff';
import { openInMidnite } from '../services/open-in-midnite';
import { keys } from '../services/queries';
import { appQueryClient } from '../services/query-client';
import { useUiStore } from '../store/ui-store';

/**
 * Studio's side of the capture feature's host port (Phase 113 Theme K).
 *
 * No destination sends anything; each only prepares a place the user then acts in.
 *
 * - **`sendToChat`** offers the attachment (a text note naming the capture's path) to chats'
 *   incoming-draft slot, which drops it into a *new* chat's draft, and hands off to Agents ▸ Chats. The
 *   user reads it, writes the prompt and presses send — or removes it.
 * - **`creator`** reads Studio's selected repository at click time (its name from the repos the rail
 *   already fetched), and reveals the imported image through the hand-off's reveal engine — the same
 *   path a `midnite://open` link to a media ref takes.
 * - **`prComment`** (slice 2) lists the selected repository's open pull requests from the forge's own
 *   query — the same key and staleness `useForgePulls` uses, so the PR list the forge views already
 *   fetched is reused, not refetched — and opens a PR's page in the embedded browser. The feature puts
 *   the screenshot on the clipboard first; the user pastes it into the forge's own comment box and
 *   presses Comment there. Nothing is posted through the forge API: it has no image upload for comments.
 */
let offered = 0;

/** The selected repository, named from the repos the rail already fetched — read at click time. */
const selectedRepo = (): { id: string; name: string } | null => {
  const id = useUiStore.getState().selectedRepoId;
  if (!id) return null;
  const repos = appQueryClient.getQueryData<RepoDescriptor[]>(keys.repos) ?? [];
  return { id, name: repos.find((r) => r.id === id)?.name ?? id };
};

/** The PR list's arguments — `useForgePulls`' defaults, so the cache entry is the forge views' own. */
const PULLS_LIMIT = 20;

const cliMessage = (result: ForgePullsResult): string | null => {
  if (result.cli.reason === 'not-installed')
    return `The forge CLI is not installed${result.cli.hint ? ` — ${result.cli.hint}` : ''}.`;
  if (result.cli.reason === 'not-authenticated')
    return `The forge CLI is not signed in${result.cli.hint ? ` — ${result.cli.hint}` : ''}.`;
  return result.error;
};

export const STUDIO_CAPTURE_PR_COMMENT: CapturePrCommentHost = {
  repo: selectedRepo,
  pulls: async (repoId) => {
    try {
      const result = await appQueryClient.fetchQuery<ForgePullsResult>({
        queryKey: forgeKeys.forgePulls(repoId, PULLS_LIMIT, 'open', 'all'),
        queryFn: async () => {
          const api = bridge();
          if (!api) throw new Error('The forge is not available in this window.');
          return api.forge.pulls({ repoId, limit: PULLS_LIMIT, state: 'open', scope: 'all' });
        },
        staleTime: FORGE_STALE_MS,
      });
      const problem = cliMessage(result);
      if (problem) return { ok: false, message: problem };
      return {
        ok: true,
        pulls: result.pulls.map((p) => ({ number: p.number, title: p.title, url: p.url })),
      };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  },
  open: ({ repoId, url }) => openInMidnite(url, { target: 'in-app', originRepoId: repoId }),
};

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
  prComment: STUDIO_CAPTURE_PR_COMMENT,
  creator: {
    repo: selectedRepo,
    reveal: ({ repoId, project, path }) => {
      void requestHandoff({
        app: 'creator',
        ref: { kind: 'media', repoId, media: 'image', project, path },
      });
    },
  },
};
