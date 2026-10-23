import {
  changeSetNeedsReview,
  fenceUntrusted,
  isUntrusted,
  resolveProvenance,
  sanitizeLabel,
  UNTRUSTED_CONTENT_HEADER,
  type ChatAttachment,
  type ChatMessage,
} from '@midnite/studio-shared';

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

type TextPart = Pick<ChatMessage, 'text' | 'attachments'> & Partial<Pick<ChatMessage, 'provenance'>>;

/**
 * Whether anything in one message needs the fence header. An attachment is untrusted unless its
 * provenance says it is a repo file; a message's own text is the conversation (typing) unless its
 * provenance says otherwise.
 */
function hasUntrustedPart(message: TextPart): boolean {
  return (message.provenance !== undefined && isUntrusted(message.provenance, 'user')) || (message.attachments ?? []).some((a) => isUntrusted(a.provenance));
}

/**
 * Attachments, each as a labelled block. An untrusted one (the default) sits inside the untrusted
 * fence (`fenceUntrusted`), which names its origin and neutralises any attempt in the text to close
 * it; a repo file keeps the plain code fence. `header` puts the once-per-prompt explanation before
 * the first fenced block; the transcript builder turns it off and says it once for the whole prompt.
 */
export function renderAttachments(attachments: readonly ChatAttachment[] | undefined, opts: { header?: boolean } = {}): string {
  if (!attachments || attachments.length === 0) return '';
  const header = opts.header !== false && attachments.some((a) => isUntrusted(a.provenance)) ? `\n\n${UNTRUSTED_CONTENT_HEADER}` : '';
  return (
    header +
    attachments
      .map((a) => {
        const text = a.text.length > ATTACHMENT_CHAR_CAP ? `${a.text.slice(0, ATTACHMENT_CHAR_CAP)}\n… (truncated)` : a.text;
        const provenance = resolveProvenance(a.provenance, 'attachment');
        if (provenance.trust === 'untrusted') {
          return `\n\nAttached file "${sanitizeLabel(a.name)}":\n${fenceUntrusted(text, { ...provenance, ref: provenance.ref || a.name })}`;
        }
        return `\n\nAttached file "${sanitizeLabel(a.name)}":\n\`\`\`\n${text}\n\`\`\``;
      })
      .join('')
  );
}

/** A user message's full text as the model sees it. */
export function userContent(message: TextPart, opts: { header?: boolean } = {}): string {
  const body = fenceUntrusted(message.text, message.provenance, 'user');
  const header = opts.header !== false && message.provenance !== undefined && isUntrusted(message.provenance, 'user') ? `${UNTRUSTED_CONTENT_HEADER}\n\n` : '';
  return `${header}${body}${renderAttachments(message.attachments, opts)}`;
}

/** Messages that finished and have something to say — a failed or empty turn is not context. */
function replayable(history: readonly ChatMessage[]): ChatMessage[] {
  return history.filter((m) => m.role === 'user' || (m.status === 'done' && m.text.trim().length > 0));
}

/** The assistant's own turns are the conversation, so they are fenced only if their provenance says so. */
function assistantContent(m: ChatMessage): string {
  return fenceUntrusted(m.text, m.provenance, 'user');
}

export function renderTranscript(history: readonly ChatMessage[]): string {
  const blocks = replayable(history).map(
    (m) => `${m.role === 'user' ? 'User' : 'Assistant'}:\n${m.role === 'user' ? userContent(m, { header: false }) : assistantContent(m)}`,
  );
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
  message: TextPart;
  /** The engine resumed its own session, so it already holds `history`. */
  resumed: boolean;
}): string {
  const current = userContent(input.message, { header: input.resumed || !replayable(input.history).some(hasUntrustedPart) });
  if (input.resumed) {
    return hasUnappliedEdits(input.history) ? `${UNAPPLIED_EDITS_NOTE}\n\n${current}` : current;
  }
  const transcript = renderTranscript(input.history);
  if (transcript === '') return current;
  // The fence header is said once for the whole prompt, ahead of the first fenced block anywhere in it.
  const anyUntrusted = replayable(input.history).some(hasUntrustedPart);
  return [
    ...(anyUntrusted ? [UNTRUSTED_CONTENT_HEADER, ''] : []),
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
export function buildOllamaMessages(history: readonly ChatMessage[], message: TextPart) {
  const replay = replayable(history);
  const anyUntrusted = replay.some(hasUntrustedPart) || hasUntrustedPart(message);
  return [
    // One header for the whole request, as a system message ahead of every fenced block.
    ...(anyUntrusted ? [{ role: 'system' as const, content: UNTRUSTED_CONTENT_HEADER }] : []),
    ...replay.map((m) => ({ role: m.role, content: m.role === 'user' ? userContent(m, { header: false }) : assistantContent(m) })),
    { role: 'user' as const, content: userContent(message, { header: false }) },
  ];
}
