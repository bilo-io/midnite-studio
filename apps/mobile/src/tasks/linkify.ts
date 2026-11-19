// Plain-text bodies with tappable links (Phase 146 H5: no markdown renderer this phase).
export type TextPart = { text: string; url?: string };

const URL_RE = /https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/g;

/** Split text into runs, marking each http(s) URL. Trailing punctuation stays outside the link. */
export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let at = 0;
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    if (start > at) parts.push({ text: text.slice(at, start) });
    parts.push({ text: m[0], url: m[0] });
    at = start + m[0].length;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}
