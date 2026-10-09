/**
 * Turn a thread reply into something worth saying aloud.
 *
 * A reply on screen can be a diff, a code block, a table or a ten-item list;
 * read verbatim by a synthesiser that is a wall of noise. The spoken form is
 * a condensed one: code and tables are mentioned rather than read, markdown
 * syntax is dropped, long lists are summarised ("...and 4 more"), and the
 * whole thing is capped at a couple of sentences. The thread keeps the full
 * text; only the voice gets this. (The Companion has no general markdown
 * condenser — its digests are built speakable at source — so this is the
 * one pure half Media needs; chunking and playback stay `speaker.ts`'s.)
 */

export const SPEECH_MAX_CHARS = 280;
const LIST_ITEMS_SPOKEN = 3;

const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;

function stripInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'a link')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function capAtSentence(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const lastStop = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '));
  if (lastStop >= max / 2) return head.slice(0, lastStop + 1);
  const lastSpace = head.lastIndexOf(' ');
  return `${head.slice(0, lastSpace > 0 ? lastSpace : max).replace(/[,;:]$/, '')}...`;
}

export function simplifyForSpeech(markdown: string, max = SPEECH_MAX_CHARS): string {
  const sentences: string[] = [];
  let items: string[] = [];
  let sawCode = false;
  let sawTable = false;

  const flushList = (): void => {
    if (items.length === 0) return;
    const spoken = items.slice(0, LIST_ITEMS_SPOKEN);
    const rest = items.length - spoken.length;
    const joined = spoken.join(', ');
    sentences.push(rest > 0 ? `${joined}, and ${rest} more.` : `${joined}.`);
    items = [];
  };

  let inFence = false;
  for (const raw of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(raw)) {
      inFence = !inFence;
      sawCode = true;
      continue;
    }
    if (inFence) continue;
    if (/^\s*\|.*\|\s*$/.test(raw)) {
      sawTable = true;
      continue;
    }
    if (/^\s*([-*_]\s*){3,}$/.test(raw) || /^\s*>?\s*$/.test(raw)) {
      flushList();
      continue;
    }
    const bullet = BULLET.exec(raw);
    if (bullet) {
      const item = stripInline(bullet[1] ?? '').replace(/[.!?]+$/, '');
      if (item) items.push(item);
      continue;
    }
    flushList();
    const line = stripInline(raw.replace(/^\s*(#{1,6}|>)\s*/, ''));
    if (line) sentences.push(/[.!?:]$/.test(line) ? line : `${line}.`);
  }
  flushList();

  if (sawCode) sentences.push('I have left the code on screen.');
  if (sawTable) sentences.push('There is a table on screen.');
  return capAtSentence(sentences.join(' ').replace(/\s+/g, ' ').trim(), max);
}
