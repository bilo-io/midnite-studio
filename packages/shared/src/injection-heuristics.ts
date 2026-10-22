import { z } from 'zod';

/**
 * Prompt-injection markers in captured page text (Phase 117 Theme G).
 *
 * **These are not the defence.** An attacker who reads this file can phrase around every pattern in
 * it, and injection is an unsolved problem. The defence is structural: while an agent session is
 * live, the tab loses its egress to unlisted origins and the session holds no vault grant
 * (`browser-agent.ts`, `runtime/src/vault/grants.ts`). What this module does is cheaper and still
 * useful. It flags the obvious cases so a hit sets the page's verdict to `caution` and shows up in
 * the session log, which a person reviewing a session can act on.
 *
 * Pure: the page reader (main) hands it the visible text plus the segments it found hidden
 * (CSS-hidden, zero-size, or coloured like the background). The fixtures in the test are the
 * published Comet and Atlas patterns.
 */

export const InjectionHitKindSchema = z.enum([
  /** Instruction-shaped text the user can see. */
  'instruction',
  /** Instruction-shaped text the user cannot see: the classic indirect-injection carrier. */
  'hidden-instruction',
  /** A `midnite-studio://` or `midnite://` link in the page text, which no article needs to show an agent. */
  'deep-link',
]);
export type InjectionHitKind = z.infer<typeof InjectionHitKindSchema>;

export const InjectionHitSchema = z
  .object({
    kind: InjectionHitKindSchema,
    /** Which rule matched, for the session log. */
    rule: z.string().max(64),
    /** A short window around the match, never the whole text. */
    excerpt: z.string().max(160),
  })
  .strict();
export type InjectionHit = z.infer<typeof InjectionHitSchema>;

/** At most this many hits are kept; past it the verdict is already `caution`. */
export const MAX_INJECTION_HITS = 20;

const INSTRUCTION_RULES: ReadonlyArray<{ rule: string; pattern: RegExp }> = [
  { rule: 'ignore-previous', pattern: /\b(?:ignore|forget|override)\s+(?:all\s+|any\s+)?(?:of\s+)?(?:the\s+|your\s+)?(?:previous|prior|above|earlier|preceding|original)\s+(?:instructions?|prompts?|directions?|rules?|messages?)/i },
  { rule: 'disregard', pattern: /\bdisregard\s+(?:all\s+|any\s+)?(?:the\s+|your\s+)?(?:previous|prior|above|system|safety)?\s*(?:instructions?|rules?|guidelines?|guardrails?)/i },
  { rule: 'addressed-to-agent', pattern: /\b(?:instructions?|note|message|attention)\s+(?:for|to)\s+(?:the\s+)?(?:ai|assistant|agent|llm|model|perplexity|comet|chatgpt|atlas|claude|gemini|copilot)\b/i },
  { rule: 'role-reset', pattern: /\byou\s+are\s+now\s+(?:in\s+)?(?:a|an|the|developer|dan|unrestricted|jailbreak)\b/i },
  { rule: 'new-instructions', pattern: /(?:^|\s)(?:new|updated|real|system)\s+instructions?\s*[:-]/i },
  { rule: 'prompt-tags', pattern: /<\/?\s*(?:system|instructions?|assistant)\s*>|\[\/?INST\]|<\|im_start\|>/i },
  { rule: 'conceal-from-user', pattern: /\b(?:do\s+not|don't|never)\s+(?:tell|inform|alert|notify|show|mention\s+(?:this|it)\s+to)\s+the\s+user\b/i },
  { rule: 'exfiltrate', pattern: /\b(?:send|post|upload|forward|exfiltrate|append)\s+(?:the|your|all|this|any)\b.{0,60}?\b(?:to|at)\s+https?:\/\//i },
  { rule: 'credential-ask', pattern: /\b(?:enter|paste|type|reveal|read|copy|extract|send)\b.{0,60}?\b(?:password|one-time\s+code|otp|2fa\s+code|verification\s+code|api\s+key|session\s+cookie|seed\s+phrase|private\s+key)\b/i },
];

const DEEP_LINK = /\bmidnite(?:-studio)?:\/\/[^\s"'<>)]*/i;

function excerptAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, index + length + 40);
  const raw = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return raw.length > 160 ? `${raw.slice(0, 159)}…` : raw;
}

function scan(text: string, kind: 'instruction' | 'hidden-instruction', out: InjectionHit[]): void {
  for (const { rule, pattern } of INSTRUCTION_RULES) {
    if (out.length >= MAX_INJECTION_HITS) return;
    const match = pattern.exec(text);
    if (match) out.push({ kind, rule, excerpt: excerptAround(text, match.index, match[0].length) });
  }
}

/**
 * Every marker found in a page capture. `hidden` is the text of the elements the reader judged
 * invisible to the user; a hidden segment that is instruction-shaped is the stronger signal and is
 * reported as `hidden-instruction`. The visible text is scanned for the same shapes, and both are
 * scanned for deep links.
 */
export function scanForInjection(input: { text: string; hidden?: readonly string[] }): InjectionHit[] {
  const hits: InjectionHit[] = [];
  const hidden = (input.hidden ?? []).filter((segment) => typeof segment === 'string' && segment.trim() !== '');
  for (const segment of hidden) scan(segment, 'hidden-instruction', hits);
  scan(input.text, 'instruction', hits);
  for (const source of [...hidden, input.text]) {
    if (hits.length >= MAX_INJECTION_HITS) break;
    const match = DEEP_LINK.exec(source);
    if (match) {
      hits.push({ kind: 'deep-link', rule: 'midnite-link', excerpt: excerptAround(source, match.index, match[0].length) });
      break;
    }
  }
  return hits.slice(0, MAX_INJECTION_HITS);
}
