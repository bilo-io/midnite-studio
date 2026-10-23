/**
 * The prompt-injection detector (Phase 121 Theme A).
 *
 * **A score, never a verdict.** An attacker who reads this file can phrase around every pattern in
 * it, and a benign document that discusses injection will trip some of them. The defence is
 * structural (provenance tags and the fence, `shared/src/untrusted-fence.ts`); this is the cheap
 * second layer that lets a person see "this attachment looks like it is talking to the model"
 * before it is sent. Each signal has a weight, each is counted once however often it matches, and
 * the weights combine as a noisy-or so no pile of weak hits becomes certain.
 *
 * Pure and synchronous: no I/O, no `electron`, never throws. Chats and Councils reach it through
 * the `security.scanContent` IPC op; Theme C consumes it by injection (`McpDescriptionScanner`).
 */

export type InjectionSignalId =
  | 'unicode-tag-characters'
  | 'invisible-controls'
  | 'html-comment'
  | 'hidden-span'
  | 'base64-run'
  | 'addressed-to-model'
  | 'role-marker'
  | 'tool-call-shape'
  | 'url-credentials';

export type InjectionSignal = {
  id: InjectionSignalId;
  /** The weight this signal contributed, after the code-context discount. 0 to 1. */
  weight: number;
  /** The first match, `[start, end)` in the scanned text. */
  span?: [number, number];
  /** Every match (at most {@link MAX_RUNS}), what {@link stripFlaggedRuns} removes. */
  runs?: Array<[number, number]>;
};

export type InjectionScan = { score: number; signals: InjectionSignal[] };

/** At or above this the UI shows its banner. Chosen so no single weak signal reaches it. */
export const INJECTION_THRESHOLD = 0.5;

const MAX_RUNS = 50;
/** A match inside a code span, fence or quotation marks is usually a document quoting an attack, not making one. */
const CODE_DISCOUNT = 0.25;
/** Cap on the text scanned, so a huge attachment cannot stall main. */
const MAX_SCAN_CHARS = 400_000;

type Rule = { id: InjectionSignalId; weight: number; pattern: RegExp; /** The match is structural, not prose, so a code context does not excuse it. */ structural?: boolean };

const RULES: readonly Rule[] = [
  // Tag characters render as nothing and decode to ASCII: an invisible instruction channel.
  { id: 'unicode-tag-characters', weight: 0.9, structural: true, pattern: /[\u{E0000}-\u{E007F}]+/gu },
  // Zero-width and bidi controls. U+200D (ZWJ) and U+FE0F are left out: emoji need them.
  { id: 'invisible-controls', weight: 0.4, structural: true, pattern: /[​‌⁠⁡-⁤᠎‪-‮⁦-⁩]+|(?<=.)﻿+/gsu },
  { id: 'html-comment', weight: 0.3, pattern: /<!--(?!\s*-->)[\s\S]{4,2000}?-->/g },
  {
    id: 'hidden-span',
    weight: 0.4,
    pattern:
      /<(?:span|div|p|font|section)\b[^>]*(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?:px|pt|em|rem)?\b|opacity\s*:\s*0(?:\.0+)?\b|\bhidden\b(?!\s*=\s*["']?false)|aria-hidden\s*=\s*["']true)[^>]*>[\s\S]{0,4000}?<\/(?:span|div|p|font|section)>/gi,
  },
  { id: 'base64-run', weight: 0.4, pattern: /(?<![A-Za-z0-9+/=])(?<!base64,)[A-Za-z0-9+/]{200,}={0,2}(?![A-Za-z0-9+/])/g },
  {
    id: 'addressed-to-model',
    weight: 0.6,
    pattern: new RegExp(
      [
        // "ignore all previous instructions", "disregard the above rules", "forget your prior prompt".
        String.raw`\b(?:ignore|disregard|forget|override|bypass)\s+(?:all\s+|any\s+|every\s+)?(?:of\s+)?(?:the\s+|your\s+|my\s+)?(?:previous|prior|above|earlier|preceding|original|system|safety)\s+(?:instructions?|prompts?|directions?|rules?|messages?|guidelines?|context)\b`,
        // "Attention AI:", "note to the assistant", "instructions for the model".
        String.raw`\b(?:attention|hey|dear|hello|note\s+to|message\s+to|instructions?\s+(?:for|to)|important\s+(?:for|to))[\s,:-]+(?:the\s+)?(?:ai|assistant|llm|language\s+model|model|agent|chatbot|claude|chatgpt|copilot|gemini)\b`,
        // "you are now DAN", "from now on you must".
        String.raw`\byou\s+are\s+now\s+(?:in\s+)?(?:a|an|the|developer|dan|unrestricted|jailbroken)\b`,
        String.raw`\bfrom\s+now\s+on,?\s+you\s+(?:must|will|shall|are)\b`,
        // "do not tell the user".
        String.raw`\b(?:do\s+not|don't|never)\s+(?:tell|inform|alert|notify|mention\s+(?:this|it)\s+to)\s+the\s+user\b`,
      ].join('|'),
      'gi',
    ),
  },
  {
    id: 'role-marker',
    weight: 0.35,
    pattern: /<\|(?:im_start|im_end|system|user|assistant|endoftext)\|>|\[\/?INST\]|<<\/?SYS>>|<\/?s>|^[ \t]*(?:system|assistant|developer)[ \t]*:(?=[ \t]*\S)/gim,
  },
  {
    id: 'tool-call-shape',
    weight: 0.5,
    pattern:
      /<\/?(?:tool_call|function_calls?|invoke|tool_use)\b[^>]*>|\{\s*"(?:tool|tool_name|function|name)"\s*:\s*"[^"\n]{1,80}"\s*,\s*"(?:arguments|args|input|parameters)"\s*:\s*[{"[]/g,
  },
  // `https://user:secret@host` and `https://token@host`: credentials in a URL, which an injected
  // instruction uses to name a destination that looks like a login.
  { id: 'url-credentials', weight: 0.45, structural: true, pattern: /\bhttps?:\/\/[^\s/@:"'<>]+(?::[^\s/@"'<>]*)?@[A-Za-z0-9.-]+/gi },
];

/** `[start, end)` of each fenced block and inline code span in a markdown-ish text. */
function codeRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const m of text.matchAll(/(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n[ \t]*\1[`~]*[ \t]*(?=\n|$)|$)/g)) ranges.push([m.index, m.index + m[0].length]);
  for (const m of text.matchAll(/(?<!`)(`{1,2})(?!`)[^`\n]+?\1(?!`)/g)) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

/** A phrase set off in quotation marks, as a document does when it names an attack rather than makes one. */
function quoted(text: string, start: number, end: number): boolean {
  const before = text[start - 1];
  if (before !== '"' && before !== '\u201C') return false;
  return /["\u201D]/.test(text.slice(end, end + 120));
}

const inside = (ranges: ReadonlyArray<[number, number]>, start: number, end: number): boolean => ranges.some(([a, b]) => start >= a && end <= b);

/** Scans `text`. Never throws; an unscannable value scores 0. */
export function scoreInjection(text: string): InjectionScan {
  if (typeof text !== 'string' || text === '') return { score: 0, signals: [] };
  const scanned = text.length > MAX_SCAN_CHARS ? text.slice(0, MAX_SCAN_CHARS) : text;
  let code: Array<[number, number]> | null = null;
  const signals: InjectionSignal[] = [];

  for (const rule of RULES) {
    const runs: Array<[number, number]> = [];
    let outsideCode = false;
    for (const m of scanned.matchAll(rule.pattern)) {
      if (m[0] === '') continue;
      const range: [number, number] = [m.index, m.index + m[0].length];
      if (rule.structural) outsideCode = true;
      else {
        code ??= codeRanges(scanned);
        if (!inside(code, range[0], range[1]) && !quoted(scanned, range[0], range[1])) outsideCode = true;
      }
      if (runs.length < MAX_RUNS) runs.push(range);
    }
    const first = runs[0];
    if (!first) continue;
    signals.push({ id: rule.id, weight: outsideCode ? rule.weight : rule.weight * CODE_DISCOUNT, span: first, runs });
  }

  // Noisy-or: more signals raise the score, nothing exceeds 1.
  const score = 1 - signals.reduce((rest, s) => rest * (1 - s.weight), 1);
  return { score: Math.round(score * 1000) / 1000, signals };
}

/** Whether a scan crosses {@link INJECTION_THRESHOLD}. */
export function exceedsThreshold(scan: InjectionScan): boolean {
  return scan.score >= INJECTION_THRESHOLD;
}

/**
 * The text with every run the detector flagged cut out: invisible characters, comments, hidden
 * spans, long base64, role markers and tool-call shapes. Phrases in plain prose
 * (`addressed-to-model`) are removed too, because "strip the flagged runs" must leave nothing the
 * banner named.
 */
export function stripFlaggedRuns(text: string, scan: InjectionScan = scoreInjection(text)): string {
  const cuts = scan.signals.flatMap((s) => s.runs ?? []).sort((a, b) => a[0] - b[0]);
  if (cuts.length === 0) return text;
  let out = '';
  let at = 0;
  for (const [start, end] of cuts) {
    if (end <= at) continue;
    out += text.slice(at, Math.max(at, start));
    at = end;
  }
  return out + text.slice(at);
}
