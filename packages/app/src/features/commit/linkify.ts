/**
 * The reference matcher behind linkified commit messages.
 *
 * Pure, and deliberately free of React, hast and unist: the part of this feature
 * most likely to be subtly wrong is *what counts as a reference*, and it is only
 * cheap to test if it is a string-in, data-out function. The tree walking lives
 * next door in `linkify-rehype.ts`, which imports this and knows nothing about
 * the grammar.
 */

/** One run of the input: either literal text, or something worth linking. */
export type Segment =
  | { kind: 'text'; value: string }
  /** A 40-char or abbreviated hex revision. `value` is the matched text. */
  | { kind: 'sha'; value: string }
  | { kind: 'url'; value: string; href: string }
  | { kind: 'issue'; value: string; number: number }
  | { kind: 'email'; value: string; address: string };

/**
 * Abbreviated revisions git itself would accept, plus the full form.
 *
 * The two lengths are separate alternatives with the 40 first, so a full sha is
 * never clipped to its first twelve characters — regex alternation is
 * first-match, not longest-match, and getting this the wrong way round produces
 * a link that works (git resolves the prefix) pointing at text that lies.
 *
 * Lower-case only: git prints shas lower-case, and accepting `[A-F]` makes every
 * upper-case acronym of 7+ letters drawn from A–F a candidate.
 */
const SHA = String.raw`(?:[0-9a-f]{40}|[0-9a-f]{7,12})`;

/**
 * A bare URL.
 *
 * Stops at whitespace and at the bracket characters that surround a URL far more
 * often than they appear inside one. The remaining trailing punctuation is
 * trimmed afterwards rather than excluded here, because whether a `)` belongs to
 * the URL depends on what came before it — see `trimUrlTail`.
 */
const URL_PATTERN = String.raw`https?:\/\/[^\s<>"'\[\]{}]+`;

/**
 * An addr-spec, in the subset that appears in git trailers.
 *
 * Not full RFC 5322 — that grammar admits quoted local parts, comments and
 * domain literals, none of which git's own `%ae` ever produces and all of which
 * would widen the pattern enough to start swallowing prose. This is the shape
 * an email actually has in a `Co-Authored-By` line.
 */
const EMAIL = String.raw`[A-Za-z0-9._%+\-]+@[A-Za-z0-9](?:[A-Za-z0-9\-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9\-]*[A-Za-z0-9])?)+`;

/**
 * An issue reference.
 *
 * Capped at seven digits: no forge has an eight-digit issue number, and the cap
 * is what stops a long digit string (a timestamp, a phone number written with a
 * leading `#`) from becoming a link to nothing.
 *
 * The trailing `(?!\d)` is what makes the cap a cap. Without it the quantifier
 * simply takes the first seven digits of `#12345678` and links `#1234567`,
 * leaving a stray `8` — a link to a real but entirely unrelated issue, which is
 * a worse outcome than no link at all.
 */
const ISSUE = String.raw`#\d{1,7}(?!\d)`;

/**
 * The alternation, ordered so the most specific pattern wins.
 *
 * URL first is load-bearing, not stylistic. `https://github.com/o/r/commit/deadbeef123`
 * contains a perfectly valid abbreviated sha and an issue-shaped fragment; with
 * SHA first, the URL would be shredded into three links, one of which navigates
 * the inspector somewhere unrelated. Email comes next for the same reason — a
 * domain's dotted segments are not shas, but a local part can be.
 */
const PATTERN = new RegExp(`(${URL_PATTERN})|(${EMAIL})|\\b(${SHA})\\b|(${ISSUE})`, 'g');

/**
 * Trailing characters that are punctuation of the sentence, not of the URL.
 *
 * `Fixed in https://example.com/issues/4.` ends in a full stop belonging to the
 * prose. Closing brackets are handled separately because they may be the URL's
 * own — Wikipedia's `..._(software)` is the canonical case.
 */
const URL_TAIL = /[.,;:!?'"]+$/;

/**
 * Give back any trailing punctuation the greedy match swallowed.
 *
 * Unbalanced closers are dropped one at a time so `(see https://example.com)`
 * loses its `)` while `https://en.wikipedia.org/wiki/Git_(software)` keeps one.
 */
function trimUrlTail(url: string): string {
  let out = url.replace(URL_TAIL, '');

  // Repeat: `…/Git_(software).` needs the stop removed, then the paren kept.
  for (;;) {
    const last = out.at(-1);
    if (last === ')' || last === ']' || last === '}') {
      const open = last === ')' ? '(' : last === ']' ? '[' : '{';
      const opens = out.split(open).length - 1;
      const closes = out.split(last).length - 1;
      if (closes <= opens) break;
      out = out.slice(0, -1);
    } else if (URL_TAIL.test(out)) {
      out = out.replace(URL_TAIL, '');
    } else {
      break;
    }
  }
  return out;
}

/**
 * Whether an abbreviated hex run is plausibly a revision rather than English or
 * an ordinary number.
 *
 * An abbreviation must contain BOTH a digit and a hex letter, which rules out the
 * two classes of thing that are accidentally hex:
 *
 * - words — `deadbeef`, `facade`, `decade`, `accede`, `defaced`, all of which a
 *   commit message may legitimately contain;
 * - plain numbers — `12345678`, a record count, a date stamp, an issue number
 *   somebody wrote without the `#`.
 *
 * The cost is a genuine abbreviation that happens to be all one or the other:
 * about 3.7% of 7-character shas are pure digits and 0.14% pure letters. That is
 * not nothing, and it is still the right trade: a missed link renders as the
 * text the author typed, whereas a false one is a control that navigates the
 * inspector to an unrelated commit — or, for a number, to nothing at all.
 *
 * The rule applies only to the abbreviated form. A full 40-character run is not
 * a word and not a number anybody writes, so demanding anything of it would be
 * rejecting the one case with no ambiguity in it.
 */
function isPlausibleAbbrev(sha: string): boolean {
  return sha.length === 40 || (/\d/.test(sha) && /[a-f]/.test(sha));
}

/**
 * Split text into linkable segments.
 *
 * Adjacent text is never split for its own sake: a run with no references comes
 * back as a single `text` segment, which is what keeps the tree walker from
 * replacing every paragraph in a message with a hundred one-character nodes.
 */
export function segment(text: string): Segment[] {
  const out: Segment[] = [];
  let cursor = 0;

  // A fresh lastIndex per call — the regex is module-level and `g`-flagged, so
  // reusing it across calls without this leaks state between messages.
  PATTERN.lastIndex = 0;

  for (let match = PATTERN.exec(text); match !== null; match = PATTERN.exec(text)) {
    const [raw, url, email, sha, issue] = match;
    let matched = raw;
    let produced: Segment | null = null;

    if (url !== undefined) {
      const href = trimUrlTail(url);
      // A URL trimmed to nothing but its scheme is not a link; fall through to
      // text so `https://` on its own renders as the typo it is.
      if (href.length > 'https://'.length) {
        produced = { kind: 'url', value: href, href };
        matched = href;
      }
    } else if (email !== undefined) {
      produced = { kind: 'email', value: email, address: email };
    } else if (sha !== undefined) {
      if (isPlausibleAbbrev(sha)) produced = { kind: 'sha', value: sha };
    } else if (issue !== undefined) {
      produced = { kind: 'issue', value: issue, number: Number.parseInt(issue.slice(1), 10) };
    }

    if (produced === null) continue;

    if (match.index > cursor) {
      out.push({ kind: 'text', value: text.slice(cursor, match.index) });
    }
    out.push(produced);
    cursor = match.index + matched.length;
    // Trimming a URL shortens the match, so the scan must resume at the
    // character the trim gave back rather than past it.
    PATTERN.lastIndex = cursor;
  }

  if (cursor < text.length) out.push({ kind: 'text', value: text.slice(cursor) });
  return out;
}
