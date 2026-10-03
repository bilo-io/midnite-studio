import { changeSetNeedsReview, type ChatAttachment, type ChatMessage } from '@midnite/studio-shared';

/**
 * Turning a thread into the text one turn sends.
 *
 * Two cases. A CLI that resumed its own session already holds the history, so
 * only the new message goes (plus a correction note when earlier edits were
 * never applied). One that did not — no resume support, a changed directory, a
 * rewound thread, an Ollama model — gets the thread replayed as a transcript.
 */

/** A replay longer than this drops its oldest turns first — the newest context matters most. */
export const TRANSCRIPT_CHAR_CAP = 40_000;
/** One attachment is inlined up to this many characters. */
const ATTACHMENT_CHAR_CAP = 60_000;

export function renderAttachments(attachments: readonly ChatAttachment[] | undefined): string {
  if (!attachments || attachments.length === 0) return '';
  return attachments
    .map((a) => {
      const text = a.text.length > ATTACHMENT_CHAR_CAP ? `${a.text.slice(0, ATTACHMENT_CHAR_CAP)}\n… (truncated)` : a.text;
      return `\n\nAttached file "${a.name}":\n\`\`\`\n${text}\n\`\`\``;
    })
    .join('');
}

/** A user message's full text as the model sees it. */
export function userContent(message: Pick<ChatMessage, 'text' | 'attachments'>): string {
  return `${message.text}${renderAttachments(message.attachments)}`;
}

/** Messages that finished and have something to say — a failed or empty turn is not context. */
function replayable(history: readonly ChatMessage[]): ChatMessage[] {
  return history.filter((m) => m.role === 'user' || (m.status === 'done' && m.text.trim().length > 0));
}

export function renderTranscript(history: readonly ChatMessage[]): string {
  const blocks = replayable(history).map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}:\n${m.role === 'user' ? userContent(m) : m.text}`);
  let total = 0;
  const kept: string[] = [];
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    total += blocks[i]!.length;
    if (total > TRANSCRIPT_CHAR_CAP && kept.length > 0) break;
    kept.unshift(blocks[i]!);
  }
  return kept.join('\n\n');
}

/** Whether an earlier turn's edits were left unapplied — which the model, resuming, cannot know. */
export function hasUnappliedEdits(history: readonly ChatMessage[]): boolean {
  return history.some(
    (m) => m.changeSet !== undefined && (m.changeSet.status === 'rejected' || m.changeSet.status === 'partial' || changeSetNeedsReview(m.changeSet)),
  );
}

export const UNAPPLIED_EDITS_NOTE =
  'Note: file edits you made in earlier turns of this conversation were reviewed by the user, and some were not applied ' +
  '(rejected, or still waiting). The files in your working directory are the user\'s current files — read them before ' +
  'relying on anything you remember changing.';

export function buildTurnPrompt(input: {
  /** The thread before the new user message. */
  history: readonly ChatMessage[];
  message: Pick<ChatMessage, 'text' | 'attachments'>;
  /** The engine resumed its own session, so it already holds `history`. */
  resumed: boolean;
}): string {
  const current = userContent(input.message);
  if (input.resumed) {
    return hasUnappliedEdits(input.history) ? `${UNAPPLIED_EDITS_NOTE}\n\n${current}` : current;
  }
  const transcript = renderTranscript(input.history);
  if (transcript === '') return current;
  return [
    'This is a continuing conversation. The earlier turns are below, oldest first, for context only —',
    'answer the final message.',
    ...(hasUnappliedEdits(input.history) ? ['', UNAPPLIED_EDITS_NOTE] : []),
    '',
    '<conversation>',
    transcript,
    '</conversation>',
    '',
    'Final message from the user:',
    current,
  ].join('\n');
}

/** The role/content list an Ollama `/api/chat` call takes: the whole thread, then the new message. */
export function buildOllamaMessages(history: readonly ChatMessage[], message: Pick<ChatMessage, 'text' | 'attachments'>) {
  return [
    ...replayable(history).map((m) => ({ role: m.role, content: m.role === 'user' ? userContent(m) : m.text })),
    { role: 'user' as const, content: userContent(message) },
  ];
}
