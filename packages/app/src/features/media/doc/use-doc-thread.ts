import { docThreadPath, type DocThread, type DocThreadMessage, type LoopModel } from '@midnite/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { bridge } from '../../../services/bridge';
import { noBridge } from '../../../services/bridge-result';
import { MEDIA_KEYS } from '../use-media';
import {
  appendMessage,
  newMessageId,
  parseThread,
  serializeThread,
  setProposalStatus,
} from './doc-thread';
import type { DocRef } from './use-doc-session';

/**
 * A doc's AI thread (Phase 99 Theme B), persisted beside it as
 * `<doc>.thread.json` through the media store. A missing sidecar is an empty
 * thread, so the read never retries. The cache entry is the thread itself;
 * every change writes the whole sidecar.
 */
export function useDocThread(doc: DocRef | null) {
  const client = useQueryClient();
  const threadPath = doc ? docThreadPath(doc.path) : '';
  const queryKey = MEDIA_KEYS.file(doc?.repoId ?? '', 'doc', doc?.project ?? '', threadPath);

  const thread = useQuery<string | null>({
    queryKey,
    enabled: doc !== null,
    retry: false,
    queryFn: async () => {
      const result = await bridge()?.media.file.read({
        repoId: doc!.repoId,
        tab: 'doc',
        project: doc!.project,
        path: threadPath,
      });
      return result?.ok ? result.value : null;
    },
  });

  const current = (): DocThread => parseThread(client.getQueryData<string | null>(queryKey) ?? thread.data);

  const save = async (next: DocThread) => {
    const text = serializeThread(next);
    client.setQueryData(queryKey, text);
    if (!doc) return;
    await bridge()?.media.file.write({
      repoId: doc.repoId,
      tab: 'doc',
      project: doc.project,
      path: threadPath,
      content: text,
    });
  };

  const ask = useMutation({
    mutationFn: async (input: {
      prompt: string;
      markdown: string;
      selection?: string | undefined;
      agentId?: string | undefined;
      model?: LoopModel | undefined;
    }) => {
      if (!doc) return;
      const scoped = input.selection !== undefined && input.selection.trim().length > 0;
      const user: DocThreadMessage = {
        id: newMessageId(),
        role: 'user',
        text: input.prompt,
        createdAt: Date.now(),
      };
      await save(appendMessage(current(), user));
      const result =
        (await bridge()?.media.doc.edit({
          repoId: doc.repoId,
          project: doc.project,
          path: doc.path,
          markdown: input.markdown,
          prompt: input.prompt,
          ...(scoped ? { selection: input.selection } : {}),
          ...(input.agentId ? { agentId: input.agentId } : {}),
          ...(input.model ? { model: input.model } : {}),
        })) ?? noBridge<{ replacement: string }>();
      const reply: DocThreadMessage = result.ok
        ? {
            id: newMessageId(),
            role: 'assistant',
            text: scoped ? 'Proposed an edit to the selection.' : 'Proposed an edit to the document.',
            createdAt: Date.now(),
            proposal: {
              scope: scoped ? 'selection' : 'doc',
              original: scoped ? input.selection! : input.markdown,
              replacement: result.value.replacement,
              status: 'pending',
            },
          }
        : {
            id: newMessageId(),
            role: 'assistant',
            text: '',
            createdAt: Date.now(),
            error: result.kind === 'error' ? result.message : 'The edit could not run.',
          };
      await save(appendMessage(current(), reply));
    },
  });

  return {
    messages: parseThread(thread.data).messages,
    loading: thread.isPending && doc !== null,
    ask,
    resolve: (messageId: string, status: 'accepted' | 'rejected') =>
      save(setProposalStatus(current(), messageId, status)),
  };
}
