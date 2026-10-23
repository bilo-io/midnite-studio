import { z } from 'zod';

import type { ChatAttachment } from './chats';
import { InjectionHitSchema, MAX_INJECTION_HITS, scanForInjection } from './injection-heuristics';
import { provenanceFor } from './provenance';
import { redactPaths } from './redact';

/**
 * `UntrustedPageContent`: the only shape in which a web page's content may reach an agent
 * (Phase 117 Theme G).
 *
 * A page is untrusted input, and agentic browsers have shown how it gets used: text written for the
 * model and not the reader, telling it to open a link, paste a code or send a mailbox somewhere. The
 * envelope cannot stop a model from reading that text. What it does is make sure every consumer
 * knows where the text came from (`provenance: 'page'`, `origin`, `url`), what is known about the
 * site (`verdict`), and that the text is size-capped and scrubbed of credential-shaped strings before
 * it leaves main. A consumer that renders it or feeds it to a model sees one schema, `.strict()`, so
 * a field added on one side and not the other fails validation instead of riding along unnoticed.
 *
 * `browser-agent-boundary.test.ts` in the browser feature walks every agent-facing channel and
 * fails if one carries page text outside this envelope.
 */

/** Text past this many UTF-8 bytes is cut, and `truncated` says so. 64 KiB is a long article. */
export const MAX_PAGE_TEXT_BYTES = 64 * 1024;

export const PageSafetyLevelSchema = z.enum(['unknown', 'ok', 'caution', 'danger']);
export type PageSafetyLevel = z.infer<typeof PageSafetyLevelSchema>;

/**
 * What is known about the page. `level` comes from the site verdict (Theme C) when one exists and is
 * `unknown` otherwise. Any injection marker raises it to at least `caution`, and `caution` is true
 * whenever the level is not `ok` or `unknown`.
 */
export const PageContentVerdictSchema = z
  .object({
    level: PageSafetyLevelSchema,
    caution: z.boolean(),
    injection: z.array(InjectionHitSchema).max(MAX_INJECTION_HITS),
  })
  .strict();
export type PageContentVerdict = z.infer<typeof PageContentVerdictSchema>;

function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

export const UntrustedPageContentSchema = z
  .object({
    provenance: z.literal('page'),
    origin: z.string().max(2048),
    url: z.string().max(8192),
    title: z.string().max(1024),
    capturedAt: z.string().max(64),
    verdict: PageContentVerdictSchema,
    text: z.string().refine((t) => utf8Length(t) <= MAX_PAGE_TEXT_BYTES, { message: 'page text is over MAX_PAGE_TEXT_BYTES' }),
    truncated: z.boolean(),
  })
  .strict();
export type UntrustedPageContent = z.infer<typeof UntrustedPageContentSchema>;

/** Cuts `text` to at most `maxBytes` of UTF-8 without splitting a character. */
export function truncateUtf8(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= maxBytes) return { text, truncated: false };
  const cut = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, maxBytes)).replace(/�+$/, '');
  return { text: cut, truncated: true };
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return 'null';
  }
}

export type RawPageCapture = {
  url: string;
  title: string;
  /** The page's visible text. */
  text: string;
  /** Text of elements the reader judged invisible to the user (see `injection-heuristics.ts`). */
  hidden?: readonly string[];
};

export type BuildPageContentOptions = {
  /** ISO time of the capture; defaults to now. */
  capturedAt?: string;
  /** The site verdict's level when there is one (Theme C). */
  siteLevel?: Exclude<PageSafetyLevel, 'unknown'>;
  /** Home directory for `redactPaths`, from main. */
  homeDir?: string;
};

/**
 * Wraps a raw capture in the envelope: injection scan over the full text, credential and home-path
 * redaction, the byte cap. The result always passes {@link UntrustedPageContentSchema}.
 */
export function buildUntrustedPageContent(raw: RawPageCapture, options: BuildPageContentOptions = {}): UntrustedPageContent {
  const injection = scanForInjection({ text: raw.text, hidden: raw.hidden });
  let level: PageSafetyLevel = options.siteLevel ?? 'unknown';
  if (injection.length > 0 && (level === 'unknown' || level === 'ok')) level = 'caution';
  const body = truncateUtf8(redactPaths(raw.text, options.homeDir), MAX_PAGE_TEXT_BYTES);
  const url = redactPaths(raw.url, options.homeDir).slice(0, 8192);
  return {
    provenance: 'page',
    origin: originOf(raw.url).slice(0, 2048),
    url,
    title: redactPaths(raw.title, options.homeDir).slice(0, 1024),
    capturedAt: options.capturedAt ?? new Date().toISOString(),
    verdict: { level, caution: level === 'caution' || level === 'danger', injection },
    text: body.text,
    truncated: body.truncated,
  };
}

/**
 * Page text on its way into a chat or a council (Phase 121 Theme A): an attachment tagged
 * `origin: 'web-page'`, `ref` the page URL, so it is fenced and scanned like any other untrusted
 * part. This is the seam Phase 117's envelope hands off through; nothing else turns page text into
 * a prompt part.
 */
export function pageContentToAttachment(content: UntrustedPageContent, id: string): ChatAttachment {
  const name = (content.title.trim() || content.origin || 'page').slice(0, 260);
  return { id, name, text: content.text.slice(0, 200_000), provenance: provenanceFor('web-page', content.url) };
}
