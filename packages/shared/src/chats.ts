import { z } from 'zod';

import { FileChangeKindSchema } from './domain/diff';

/**
 * Chats — conversations with the roster's agent CLIs (and local Ollama models),
 * persisted main-side and listed on the Chats page.
 *
 * Everything here crosses the IPC boundary, so it is zod-first like the rest of
 * `shared`. The pure helpers at the bottom (title, date buckets, the change-set
 * state machine) live here rather than in `app` or `desktop` because BOTH sides
 * need them: main derives a change set's status when it applies a decision, the
 * renderer derives the same thing to paint the card, and two copies would
 * drift.
 */

/** `'ollama'` or a roster agent id (`claude`, `codex`, `agy`, ...). */
export const CHAT_ENGINE_OLLAMA = 'ollama';

/**
 * What a turn is allowed to do.
 *
 * - `ask` — read-only. The agent runs in the repo itself with the CLI's own
 *   read-only/plan switch, because nothing it does can need reviewing.
 * - `edit` — the agent runs in a throwaway snapshot of the repo; whatever it
 *   changes comes back as a reviewable change set and never touches the real
 *   working tree until the user accepts it.
 */
export const ChatModeSchema = z.enum(['ask', 'edit']);
export type ChatMode = z.infer<typeof ChatModeSchema>;
export const DEFAULT_CHAT_MODE: ChatMode = 'edit';

export const CHAT_MODES: readonly { id: ChatMode; label: string; description: string }[] = [
  { id: 'ask', label: 'Ask', description: 'Read-only: answers questions, never edits files' },
  { id: 'edit', label: 'Edit', description: 'May change files — you review every change before it lands' },
];

// --- change sets -------------------------------------------------------------

export const ChatHunkStatusSchema = z.enum(['pending', 'accepted', 'rejected']);
export type ChatHunkStatus = z.infer<typeof ChatHunkStatusSchema>;

/**
 * `partial` is derived (some hunks accepted, some rejected or still pending);
 * `conflict` is set when applying a decision failed because the working tree
 * moved on since the snapshot.
 */
export const ChatChangeStatusSchema = z.enum(['pending', 'accepted', 'rejected', 'partial', 'conflict']);
export type ChatChangeStatus = z.infer<typeof ChatChangeStatusSchema>;

export const ChatChangedHunkSchema = z.object({
  /** The `@@ -a,b +c,d @@ heading` line, for the hunk's own row in the modal. */
  header: z.string(),
  insertions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  status: ChatHunkStatusSchema,
});
export type ChatChangedHunk = z.infer<typeof ChatChangedHunkSchema>;

export const ChatChangedFileSchema = z.object({
  path: z.string().min(1),
  oldPath: z.string().nullable(),
  change: FileChangeKindSchema,
  binary: z.boolean(),
  insertions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  /** A few `+`/`-` lines for the inline card; the full diff is fetched on demand. */
  preview: z.array(z.string()),
  hunks: z.array(ChatChangedHunkSchema),
  /** Only meaningful for a file with no hunks (binary, mode-only) — hunked files derive it. */
  fileStatus: ChatHunkStatusSchema.default('pending'),
  status: ChatChangeStatusSchema,
  /** Why the last apply failed, when `status` is `conflict`. */
  conflict: z.string().optional(),
});
export type ChatChangedFile = z.infer<typeof ChatChangedFileSchema>;

export const ChatChangeSetSchema = z.object({
  id: z.string().min(1),
  createdAt: z.number().nonnegative(),
  status: ChatChangeStatusSchema,
  files: z.array(ChatChangedFileSchema),
});
export type ChatChangeSet = z.infer<typeof ChatChangeSetSchema>;

/** One file or hunk decision. `hunks` omitted means the whole file (every undecided hunk). */
export const ChatChangeDecisionSchema = z.object({
  path: z.string().min(1),
  action: z.enum(['accept', 'reject']),
  hunks: z.array(z.number().int().nonnegative()).optional(),
});
export type ChatChangeDecision = z.infer<typeof ChatChangeDecisionSchema>;

// --- messages and chats -------------------------------------------------------

export const ChatAttachmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(260),
  /** Plain-text content, inlined into the prompt. */
  text: z.string().max(200_000),
});
export type ChatAttachment = z.infer<typeof ChatAttachmentSchema>;

export const ChatMessageStatusSchema = z.enum(['streaming', 'done', 'error', 'cancelled']);
export type ChatMessageStatus = z.infer<typeof ChatMessageStatusSchema>;

export const ChatMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  createdAt: z.number().nonnegative(),
  status: ChatMessageStatusSchema.default('done'),
  error: z.string().optional(),
  attachments: z.array(ChatAttachmentSchema).optional(),
  /** Short tool/activity lines the agent reported ("Edited src/a.ts"). */
  activity: z.array(z.string()).optional(),
  /** Engine and model that produced an assistant turn. */
  engine: z.string().optional(),
  model: z.string().nullable().optional(),
  changeSet: ChatChangeSetSchema.optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/**
 * How to resume the engine's own conversation. Only valid while `cwd` matches
 * the directory the next turn would run in — a CLI keys its sessions by
 * directory, so a changed `cwd` means a fresh session plus a transcript replay.
 */
export const ChatEngineSessionSchema = z.object({
  engine: z.string().min(1),
  id: z.string().min(1),
  cwd: z.string().min(1),
});
export type ChatEngineSession = z.infer<typeof ChatEngineSessionSchema>;

export const ChatSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  engine: z.string().min(1),
  model: z.string().nullable(),
  mode: ChatModeSchema,
  /** The repo the chat is about; `null` for a general chat. */
  repoId: z.string().nullable(),
  repoName: z.string().nullable(),
  pinned: z.boolean(),
  createdAt: z.number().nonnegative(),
  updatedAt: z.number().nonnegative(),
  messageCount: z.number().int().nonnegative(),
  preview: z.string(),
  running: z.boolean(),
  /** A change set is waiting on the user. */
  pendingChanges: z.boolean(),
});
export type ChatSummary = z.infer<typeof ChatSummarySchema>;

export const ChatSchema = ChatSummarySchema.omit({ messageCount: true, preview: true, running: true, pendingChanges: true }).extend({
  /** The repo's path when the chat was created — kept so a chat survives its repo being closed. */
  repoPath: z.string().nullable(),
  messages: z.array(ChatMessageSchema),
  session: ChatEngineSessionSchema.nullable().default(null),
});
export type Chat = z.infer<typeof ChatSchema>;

/** `<userData>/chats/<id>.json` — versioned so a later shape can migrate. */
export const StoredChatSchema = z.object({ version: z.literal(1), chat: ChatSchema });
export type StoredChat = z.infer<typeof StoredChatSchema>;

// --- streaming events --------------------------------------------------------

/**
 * Pushed on `EVENT_CHANNELS.chatsEvent`. Deltas are the live text; every other
 * kind says "this changed, refetch" — the renderer treats `chatsGet` as the
 * authority once a message settles.
 */
export const ChatEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('delta'), chatId: z.string(), messageId: z.string(), text: z.string() }),
  z.object({ kind: z.literal('activity'), chatId: z.string(), messageId: z.string(), line: z.string() }),
  z.object({ kind: z.literal('message'), chatId: z.string(), message: ChatMessageSchema }),
  z.object({ kind: z.literal('chat'), chatId: z.string() }),
  z.object({ kind: z.literal('removed'), chatId: z.string() }),
]);
export type ChatEvent = z.infer<typeof ChatEventSchema>;

// --- pure helpers --------------------------------------------------------------

/** First line of the first message, trimmed to a row's worth. */
export function chatTitleFromText(text: string): string {
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return 'New chat';
  return line.length > 48 ? `${line.slice(0, 47).trimEnd()}…` : line;
}

export const CHAT_DATE_BUCKETS = ['today', 'week', 'month', 'older'] as const;
export type ChatDateBucket = (typeof CHAT_DATE_BUCKETS)[number];

export const CHAT_DATE_BUCKET_LABEL: Record<ChatDateBucket, string> = {
  today: 'Today',
  week: 'Last 7 days',
  month: 'Last 30 days',
  older: 'Older',
};

const DAY_MS = 86_400_000;

/** Which date filter bucket an `updatedAt` falls in, relative to `now`. */
export function chatDateBucket(updatedAt: number, now: number): ChatDateBucket {
  const age = now - updatedAt;
  if (age < DAY_MS) return 'today';
  if (age < 7 * DAY_MS) return 'week';
  if (age < 30 * DAY_MS) return 'month';
  return 'older';
}

/**
 * The card state machine.
 *
 * A file's status derives from its hunks, never the other way round: with
 * hunks, all-accepted is `accepted`, all-rejected `rejected`, any mix (or one
 * still pending beside a decided one) `partial`; with none (binary, mode-only)
 * its own `fileStatus` stands. `conflict` overrides everything — it is a
 * failed apply the user has not resolved yet, and it clears the moment the
 * file is decided again.
 */
export function deriveFileStatus(file: Pick<ChatChangedFile, 'hunks' | 'fileStatus' | 'conflict'>): ChatChangeStatus {
  if (file.conflict !== undefined) return 'conflict';
  const states = file.hunks.length > 0 ? file.hunks.map((h) => h.status) : [file.fileStatus];
  if (states.every((s) => s === 'pending')) return 'pending';
  if (states.every((s) => s === 'accepted')) return 'accepted';
  if (states.every((s) => s === 'rejected')) return 'rejected';
  return 'partial';
}

/** The change set's own status: conflict wins, then the uniform state, else partial. */
export function deriveChangeSetStatus(files: readonly Pick<ChatChangedFile, 'status'>[]): ChatChangeStatus {
  if (files.length === 0) return 'accepted';
  if (files.some((f) => f.status === 'conflict')) return 'conflict';
  if (files.every((f) => f.status === 'pending')) return 'pending';
  if (files.every((f) => f.status === 'accepted')) return 'accepted';
  if (files.every((f) => f.status === 'rejected')) return 'rejected';
  return 'partial';
}

/** The outcome of one decision, as the apply step reports it. */
export type ChatDecisionOutcome = { path: string; ok: true } | { path: string; ok: false; reason: string };

/**
 * Fold decisions and their outcomes into a change set — pure, so the same
 * transition table runs in main (real apply results) and in tests.
 *
 * A failed outcome leaves the hunks as they were and marks the file
 * `conflict`; a successful accept marks the named hunks (or every pending one)
 * accepted; a reject marks them rejected. Hunks that were already decided are
 * never flipped back by a whole-file decision.
 */
export function reduceChangeSet(
  changeSet: ChatChangeSet,
  decisions: readonly ChatChangeDecision[],
  outcomes: readonly ChatDecisionOutcome[],
): ChatChangeSet {
  const files = changeSet.files.map((file) => {
    const decision = decisions.find((d) => d.path === file.path);
    if (!decision) return file;
    const outcome = outcomes.find((o) => o.path === file.path);
    if (outcome && !outcome.ok) {
      const { conflict: _drop, ...rest } = file;
      void _drop;
      const next = { ...rest, conflict: outcome.reason };
      return { ...next, status: deriveFileStatus(next) };
    }
    const target: ChatHunkStatus = decision.action === 'accept' ? 'accepted' : 'rejected';
    const named = decision.hunks === undefined ? null : new Set(decision.hunks);
    const hunks = file.hunks.map((h, i) =>
      h.status === 'pending' && (named === null || named.has(i)) ? { ...h, status: target } : h,
    );
    const fileStatus: ChatHunkStatus = file.hunks.length === 0 && file.fileStatus === 'pending' ? target : file.fileStatus;
    const { conflict: _drop, ...rest } = file;
    void _drop;
    const next = { ...rest, hunks, fileStatus };
    return { ...next, status: deriveFileStatus(next) };
  });
  return { ...changeSet, files, status: deriveChangeSetStatus(files) };
}

/**
 * Whether anything in the set still waits on the user: a conflict to resolve,
 * or a hunk (or, for a hunkless file, the file) nobody has decided yet. A set
 * whose every part is decided is `partial` but needs nothing more.
 */
export function changeSetNeedsReview(changeSet: Pick<ChatChangeSet, 'files'>): boolean {
  return changeSet.files.some(
    (f) =>
      f.status === 'conflict' ||
      (f.hunks.length > 0 ? f.hunks.some((h) => h.status === 'pending') : f.fileStatus === 'pending'),
  );
}
