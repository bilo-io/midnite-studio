import { useQuery } from '@tanstack/react-query';

import type { ChatSkill } from '@midnite/studio-shared';

import { bridge } from '../../services/bridge';

/**
 * What the composer's `/` and `@` pickers offer, fetched from main
 * (`chats.skills` / `chats.files`). Both are suggestion lists: a failed or
 * missing read is an empty list, never an error on the page. Skills are keyed
 * by engine + repo (the engine decides which folders are scanned), files by
 * repo — or by chat, for a chat with no repo, whose files live in its scratch
 * directory.
 */

const NO_SKILLS: readonly ChatSkill[] = [];
const NO_FILES: readonly string[] = [];

export function useChatSkills(engine: string | null, repoId: string | null): readonly ChatSkill[] {
  const query = useQuery<readonly ChatSkill[]>({
    queryKey: ['chats', 'skills', engine ?? '', repoId ?? ''],
    queryFn: async () => {
      const api = bridge()?.chats;
      if (!api?.skills || engine === null) return NO_SKILLS;
      const result = await api.skills({ engine, repoId });
      return result.ok ? result.value.skills : NO_SKILLS;
    },
    enabled: engine !== null,
    staleTime: 60_000,
  });
  return query.data ?? NO_SKILLS;
}

export function useChatFiles(repoId: string | null, chatId: string | null): readonly string[] {
  const query = useQuery<readonly string[]>({
    queryKey: ['chats', 'files', repoId ?? '', repoId === null ? (chatId ?? '') : ''],
    queryFn: async () => {
      const api = bridge()?.chats;
      if (!api?.files) return NO_FILES;
      const result = await api.files({ repoId, chatId });
      return result.ok ? result.value.files : NO_FILES;
    },
    enabled: repoId !== null || chatId !== null,
    // A new file should be mentionable without a reload, but not cost an ls-files per keystroke.
    staleTime: 15_000,
  });
  return query.data ?? NO_FILES;
}
