import { redactOutbound, type OutboundSecret } from '@midnite/studio-shared';

/**
 * Scrub secrets before they reach disk — Phase 115 Theme C.
 *
 * Log records, archived session transcripts and chats pass through here on write. Two matchers run (the
 * same ones outbound redaction uses): the vault's live values by literal match, so a prefixless Azure DevOps
 * PAT or Bitbucket app password is caught, and the shape patterns. The home directory is NOT collapsed:
 * a chat names the user's real paths and wants them back on reload.
 *
 * Synchronous on purpose (the log sink is), so the vault's values live in a snapshot that main refreshes at
 * boot and whenever a vault entry changes. The snapshot never leaves main. Live terminal scrollback is
 * never run through this: it is replayed byte-for-byte into xterm.
 */
let known: readonly OutboundSecret[] = [];

/** Replace the snapshot of live vault values. */
export function setDiskRedactionSecrets(secrets: readonly OutboundSecret[]): void {
  known = secrets;
}

/** Scrub one string. */
export function redactForDisk(text: string): string {
  if (text.length === 0) return text;
  const out = redactOutbound(text, known);
  // Untouched text is returned as it came: redactOutbound also rewrites its own private-use marker characters.
  return out.redactions.length === 0 ? text : out.text;
}

/** Scrub every string leaf of a JSON-able value (arrays and plain objects), returning a copy. */
export function redactJsonForDisk<T>(value: T): T {
  const walk = (v: unknown, depth: number): unknown => {
    if (typeof v === 'string') return redactForDisk(v);
    if (depth > 64) return v;
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
    if (v !== null && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = walk(x, depth + 1);
      return out;
    }
    return v;
  };
  return walk(value, 0) as T;
}

/**
 * Scrub terminal bytes for an archived transcript. Returns `null` when nothing matched, so the caller can keep
 * the bytes it already has. Bytes that are not valid UTF-8 are scrubbed as latin1, which round-trips every byte.
 */
export function redactBytesForDisk(bytes: Uint8Array): Uint8Array | null {
  const buf = Buffer.from(bytes);
  const utf8 = buf.toString('utf8');
  if (Buffer.from(utf8, 'utf8').equals(buf)) {
    const out = redactOutbound(utf8, known);
    return out.redactions.length === 0 ? null : Buffer.from(out.text, 'utf8');
  }
  const latin1Secrets = known.map((s) => ({ ...s, value: Buffer.from(s.value, 'utf8').toString('latin1') }));
  const out = redactOutbound(buf.toString('latin1'), latin1Secrets);
  return out.redactions.length === 0 ? null : Buffer.from(out.text, 'latin1');
}
