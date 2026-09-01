/**
 * Turning a member's raw pty byte stream into the text a synthesis prompt (and
 * the settled member view) actually wants to read.
 *
 * A council member's pty is a real login shell with a command typed and sent
 * into it (see `council-runner.ts`), so the raw capture is not just the CLI's
 * own output — it also carries the shell's startup banner, the echoed command
 * line itself, ANSI escape sequences from any progress UI the CLI draws, and
 * (once the process exits) the shell's next prompt. This module is a pragmatic
 * best-effort cleaner, not a terminal emulator: it does not attempt to
 * perfectly reconstruct what a human would have seen on screen, only to strip
 * the parts that are pure noise for an LLM reading the result.
 *
 * ANSI-stripping and carriage-return collapsing live in
 * `@midnite/studio-shared`'s `ansi.ts` — the renderer's council live-output
 * view does the same best-effort cleanup on the still-arriving stream, and a
 * second regex would drift from this one.
 */
import { collapseCarriageReturns, stripAnsi } from '@midnite/studio-shared';

/**
 * Best-effort strip of the echoed command line the pty types back at us —
 * `invocation` is the exact string `council-runner.ts` wrote to the pty, so
 * the first line matching it (once escape codes and carriage returns are
 * already gone) is almost certainly that echo rather than the CLI's own
 * output. Silently a no-op if it isn't found — a shell that echoes
 * differently than expected just leaves one extra line in, which is a cosmetic
 * cost, not a correctness one.
 */
function stripEchoedInvocation(text: string, invocation: string): string {
  const lines = text.split('\n');
  const needle = invocation.trim();
  const index = lines.findIndex((line) => line.trim() === needle);
  if (index === -1) return text;
  return lines.slice(index + 1).join('\n');
}

/**
 * The full cleaning pipeline: ANSI-strip, collapse redraws, drop the echoed
 * command, then trim boilerplate leading/trailing blank lines.
 */
export function cleanCapturedOutput(raw: string, invocation: string): string {
  const withoutAnsi = collapseCarriageReturns(stripAnsi(raw));
  const withoutEcho = stripEchoedInvocation(withoutAnsi, invocation);
  return withoutEcho.replace(/^\s*\n+/, '').replace(/\s+$/, '');
}

/**
 * Append `chunk` to `existing`, capped at `capBytes` total. Returns the
 * combined buffer (never larger than the cap) and whether this append caused
 * anything to be dropped — once `truncated` goes true for a member, it stays
 * true even if a later call is a no-op, so the caller should OR it into its
 * own running flag rather than trust this return value alone across calls.
 */
export function appendCapped(
  existing: Uint8Array,
  chunk: Uint8Array,
  capBytes: number,
): { buffer: Uint8Array; truncated: boolean } {
  if (existing.length >= capBytes) return { buffer: existing, truncated: true };

  const room = capBytes - existing.length;
  const taken = chunk.length > room ? chunk.subarray(0, room) : chunk;
  const combined = new Uint8Array(existing.length + taken.length);
  combined.set(existing, 0);
  combined.set(taken, existing.length);
  return { buffer: combined, truncated: taken.length < chunk.length };
}
