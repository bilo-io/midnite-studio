import {
  DocThreadSchema,
  type DocProposal,
  type DocThread,
  type DocThreadMessage,
} from '@midnite/studio-shared';

/**
 * The Docs AI thread's pure half (Phase 99 Theme B) — the `<doc>.thread.json`
 * sidecar's parse/serialize, the two edits a thread ever takes (append a turn,
 * resolve a proposal), and how an accepted proposal lands in the doc.
 */

export const EMPTY_THREAD: DocThread = { version: 1, messages: [] };

/** A missing, empty or corrupt sidecar reads as an empty thread, never a crash. */
export function parseThread(text: string | null | undefined): DocThread {
  if (!text) return EMPTY_THREAD;
  try {
    const parsed = DocThreadSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : EMPTY_THREAD;
  } catch {
    return EMPTY_THREAD;
  }
}

export function serializeThread(thread: DocThread): string {
  return `${JSON.stringify(thread, null, 2)}\n`;
}

export function appendMessage(thread: DocThread, message: DocThreadMessage): DocThread {
  return { ...thread, messages: [...thread.messages, message] };
}

export function setProposalStatus(
  thread: DocThread,
  messageId: string,
  status: DocProposal['status'],
): DocThread {
  return {
    ...thread,
    messages: thread.messages.map((m) =>
      m.id === messageId && m.proposal ? { ...m, proposal: { ...m.proposal, status } } : m,
    ),
  };
}

/**
 * Markdown as Docs writes it: runs of blank lines outside code fences
 * collapse to one (the serializer pads tables with an extra blank line each
 * side), and the file ends with exactly one newline.
 */
export function normalizeMarkdown(markdown: string): string {
  const out: string[] = [];
  let fenced = false;
  let blank = 0;
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (!fenced && line.trim() === '') {
      if (++blank > 1) continue;
    } else blank = 0;
    out.push(line);
  }
  return `${out.join('\n').replace(/^\n+/, '').replace(/\s+$/, '')}\n`;
}

/**
 * The doc after accepting `proposal`, or `null` when it can no longer apply.
 *
 * A whole-doc proposal replaces everything. A selection proposal replaces the
 * first occurrence of the exact markdown it was made from — so an edit made
 * since (the passage rewritten by hand, say) is refused rather than guessed
 * at, and the card offers Copy instead.
 */
export function applyProposal(current: string, proposal: DocProposal): string | null {
  if (proposal.scope === 'doc') return normalizeMarkdown(proposal.replacement);
  const at = current.indexOf(proposal.original);
  if (proposal.original.length === 0 || at < 0) return null;
  return normalizeMarkdown(
    current.slice(0, at) + proposal.replacement.trim() + current.slice(at + proposal.original.length),
  );
}

export const newMessageId = (): string => `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
