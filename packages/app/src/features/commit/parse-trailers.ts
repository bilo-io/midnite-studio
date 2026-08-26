/**
 * Splitting a commit message's trailer block off its body.
 *
 * `Co-Authored-By:`, `Signed-off-by:` and friends are metadata that happens to
 * be stored as prose. Rendered as prose they are three lines of noise at the
 * bottom of every message in this repository; rendered as a list they are what
 * they are.
 *
 * Pure and unit-tested rather than a regex in the component, because git's own
 * rules are fiddler than they look and the failure mode is silent: a rule that
 * is slightly too eager eats the last paragraph of a real message.
 */

export type Trailer = { key: string; value: string };

export type SplitMessage = {
  /** The message with the trailer block removed, trailing blank lines trimmed. */
  body: string;
  /** In document order. Empty when the tail is not a trailer block. */
  trailers: Trailer[];
};

/**
 * `Key: value`, where the key is a token git would accept.
 *
 * Letters, digits and hyphens only, which is what every convention in the wild
 * uses and what keeps a prose line containing a colon ("Note this: it broke")
 * from qualifying — a space in the key disqualifies the line.
 */
const TRAILER_LINE = /^([A-Za-z][A-Za-z0-9-]*):[ \t]*(.*)$/;

/**
 * A continuation of the previous trailer's value.
 *
 * Git folds an indented line into the trailer above it, which is how a long
 * `Reviewed-by:` with a wrapped address survives round-tripping.
 */
const CONTINUATION = /^[ \t]+\S/;

export function splitTrailers(message: string): SplitMessage {
  const lines = message.replace(/\s+$/, '').split('\n');

  // Walk back over the last run of non-blank lines: the trailer block is always
  // the final paragraph, never one in the middle.
  let start = lines.length;
  while (start > 0 && (lines[start - 1] ?? '').trim().length > 0) start -= 1;

  const block = lines.slice(start);
  // A blank line must separate the block from what precedes it. Without this
  // test a single-line message ("Fix: the thing") is entirely trailers and
  // renders as a commit with no message at all.
  const separated = start > 0 && (lines[start - 1] ?? '').trim().length === 0;

  if (!separated || block.length === 0 || !isTrailerBlock(block)) {
    return { body: lines.join('\n').replace(/\s+$/, ''), trailers: [] };
  }

  return {
    body: lines
      .slice(0, start)
      .join('\n')
      .replace(/\s+$/, ''),
    trailers: parseBlock(block),
  };
}

/**
 * Every line must be a trailer or a continuation of one.
 *
 * Git is looser — it accepts a block that is 25% prose — but the consequence of
 * being loose here is that a genuine final paragraph gets restyled as metadata
 * and, worse, visually detached from the message it belongs to. Requiring all of
 * them costs nothing real: a block with a stray prose line simply stays prose,
 * which is what it looks like.
 */
function isTrailerBlock(block: string[]): boolean {
  let sawTrailer = false;

  for (const line of block) {
    if (CONTINUATION.test(line)) {
      // A continuation with nothing above it to continue is just an indented
      // line — a code sample, or the tail of a wrapped sentence.
      if (!sawTrailer) return false;
      continue;
    }
    const match = TRAILER_LINE.exec(line);
    if (match === null) return false;
    // `https://example.com` matches `Key: value` with key `https`. A value
    // starting `//` is a URL scheme, never a trailer — and a final paragraph
    // that is just a link is common enough to be worth the special case.
    if ((match[2] ?? '').startsWith('//')) return false;
    sawTrailer = true;
  }

  return sawTrailer;
}

function parseBlock(block: string[]): Trailer[] {
  const trailers: Trailer[] = [];

  for (const line of block) {
    if (CONTINUATION.test(line)) {
      const last = trailers.at(-1);
      // Joined with a space, not a newline: the fold exists because the value
      // was too long for one line, so re-flowing it is restoring it.
      if (last) last.value = `${last.value} ${line.trim()}`.trim();
      continue;
    }
    const match = TRAILER_LINE.exec(line);
    if (match === null) continue;
    trailers.push({ key: match[1] ?? '', value: (match[2] ?? '').trim() });
  }

  return trailers;
}
