import { z } from 'zod';

import { classifySecret } from './outbound-redaction';
import { SECRET_PATTERNS } from './redact';

/**
 * Secret finding reported by the secret scanner — Phase 118 Theme F.
 */
export const SecretFindingSchema = z.object({
  file: z.string().optional(),
  line: z.number().int().nonnegative(),
  column: z.number().int().nonnegative(),
  pattern: z.string(),
  masked: z.string(),
  commit: z.string().optional(),
});
export type SecretFinding = z.infer<typeof SecretFindingSchema>;

export interface ScanSecretsOptions {
  /** Optional file path associated with the text being scanned. */
  file?: string;
  /** Optional commit SHA associated with the text (for history scan). */
  commit?: string;
  /** Optional list of literal secret values (e.g. from the vault). */
  extraSecrets?: string[];
}

/**
 * Masks a secret string so it can be safely displayed in reports, logs or confirm modals.
 * Shows the first 4 characters and the last 4 characters, with '...' in between.
 * For short strings (<= 8 chars), returns 8 asterisks.
 */
export function maskSecret(secret: string): string {
  if (secret.length <= 8) return '********';
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

/**
 * Calculates Shannon entropy of a string: -sum(p * log2(p)).
 */
export function shannonEntropy(str: string): number {
  if (!str) return 0;
  const freq = new Map<string, number>();
  for (let i = 0; i < str.length; i++) {
    const ch = str[i]!;
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }
  let entropy = 0;
  const len = str.length;
  for (const count of freq.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Negative cases for high-entropy tokens:
 * - Commit SHAs: 40-char or 64-char hexadecimal string
 * - UUIDs: 8-4-4-4-12 hex string with dashes
 * - Lockfile integrity hashes: sha512-..., sha256-..., sha1-...
 */
const COMMIT_SHA_REGEX = /^[0-9a-fA-F]{40}$|^[0-9a-fA-F]{64}$/;
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const LOCKFILE_INTEGRITY_REGEX = /^sha(?:512|384|256|1)-[A-Za-z0-9+/=]+$/;

/**
 * Checks if a candidate token matches the negative cases (benign high-entropy values).
 */
export function isBenignEntropyToken(token: string): boolean {
  if (COMMIT_SHA_REGEX.test(token)) return true;
  if (UUID_REGEX.test(token)) return true;
  if (LOCKFILE_INTEGRITY_REGEX.test(token)) return true;
  return false;
}

/**
 * Checks if a candidate token exhibits high entropy and sufficient character diversity
 * to qualify as a suspected credential/secret.
 */
export function isHighEntropySecret(token: string): boolean {
  if (token.length < 20) return false;
  if (isBenignEntropyToken(token)) return false;

  // Count character classes: lowercase, uppercase, digits, symbols
  let hasLower = false;
  let hasUpper = false;
  let hasDigit = false;
  let hasSymbol = false;

  for (let i = 0; i < token.length; i++) {
    const code = token.charCodeAt(i);
    if (code >= 97 && code <= 122) hasLower = true;
    else if (code >= 65 && code <= 90) hasUpper = true;
    else if (code >= 48 && code <= 57) hasDigit = true;
    else hasSymbol = true;
  }

  const classes = (hasLower ? 1 : 0) + (hasUpper ? 1 : 0) + (hasDigit ? 1 : 0) + (hasSymbol ? 1 : 0);

  // Pure hex strings (e.g. 32-byte API keys like AWS/Stripe hex)
  const isHexOnly = /^[0-9a-fA-F]+$/.test(token);
  if (isHexOnly) {
    // Hex has maximum possible entropy of 4.0 (log2(16)). Threshold ~3.2.
    return shannonEntropy(token) >= 3.2;
  }

  // Base64 or mixed character sets: require at least 2 character classes and entropy >= 3.8
  if (classes < 2) return false;
  return shannonEntropy(token) >= 3.8;
}

/**
 * Scans a single line of text for secrets:
 * 1. Live vault secrets (literal matches of length >= 12)
 * 2. SECRET_PATTERNS from redact.ts (known token shapes)
 * 3. High-entropy candidate tokens (runs of base64/hex characters >= 20)
 */
export function scanLine(
  line: string,
  lineNumber: number,
  options?: ScanSecretsOptions,
): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const matchedSpans: [number, number][] = [];

  const addFinding = (pattern: string, raw: string, col: number) => {
    // Avoid duplicate overlapping findings for the same span
    const start = col - 1;
    const end = start + raw.length;
    for (const [s, e] of matchedSpans) {
      if ((start >= s && start < e) || (end > s && end <= e)) return;
    }
    matchedSpans.push([start, end]);
    findings.push({
      file: options?.file,
      line: lineNumber,
      column: col,
      pattern,
      masked: maskSecret(raw),
      commit: options?.commit,
    });
  };

  // 1. Live vault values (literal match)
  if (options?.extraSecrets && options.extraSecrets.length > 0) {
    const sortedSecrets = [...options.extraSecrets]
      .filter((s) => s && s.length >= 12)
      .sort((a, b) => b.length - a.length);

    for (const secret of sortedSecrets) {
      let idx = line.indexOf(secret);
      while (idx !== -1) {
        addFinding('vault-secret', secret, idx + 1);
        idx = line.indexOf(secret, idx + secret.length);
      }
    }
  }

  // 2. SECRET_PATTERNS by shape
  for (const pattern of SECRET_PATTERNS) {
    const rx = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = rx.exec(line)) !== null) {
      const matchedText = match[0];
      if (!matchedText) break;
      addFinding(classifySecret(matchedText), matchedText, match.index + 1);
      if (!rx.global) break;
    }
  }

  // 3. High-entropy token scanner: runs of base64/hex/alphanumeric characters >= 20
  const candidateRx = /[A-Za-z0-9+/=_-]{20,}/g;
  let candidateMatch: RegExpExecArray | null;
  while ((candidateMatch = candidateRx.exec(line)) !== null) {
    const candidate = candidateMatch[0];
    if (isHighEntropySecret(candidate)) {
      addFinding('high-entropy', candidate, candidateMatch.index + 1);
    }
  }

  return findings;
}

/**
 * Scans arbitrary text line by line and returns all secret findings.
 */
export function scanText(text: string, options?: ScanSecretsOptions): SecretFinding[] {
  const lines = text.split(/\r?\n/);
  const findings: SecretFinding[] = [];
  for (let i = 0; i < lines.length; i++) {
    const lineFindings = scanLine(lines[i]!, i + 1, options);
    if (lineFindings.length > 0) {
      findings.push(...lineFindings);
    }
  }
  return findings;
}

/**
 * Scans a unified git diff (e.g. from `git diff --cached` or `git log -p`),
 * inspecting only added/modified lines (`+`).
 */
export function scanDiff(diff: string, options?: ScanSecretsOptions): SecretFinding[] {
  const lines = diff.split(/\r?\n/);
  const findings: SecretFinding[] = [];

  let currentFile = options?.file;
  let currentNewLine = 0;

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      // Format: diff --git a/path b/path
      const parts = line.split(' ');
      if (parts.length >= 4) {
        currentFile = parts[3]?.replace(/^[b]/, '').replace(/^\//, '');
      }
      continue;
    }

    if (line.startsWith('+++ b/')) {
      currentFile = line.slice(6);
      continue;
    }

    if (line.startsWith('@@ ')) {
      // Format: @@ -oldStart,oldCount +newStart,newCount @@
      const hunkMatch = /@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (hunkMatch?.[1]) {
        currentNewLine = parseInt(hunkMatch[1], 10) - 1;
      }
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      currentNewLine += 1;
      const addedContent = line.slice(1);
      const lineFindings = scanLine(addedContent, currentNewLine, {
        ...options,
        file: currentFile ?? options?.file,
      });
      if (lineFindings.length > 0) {
        findings.push(...lineFindings);
      }
    } else if (!line.startsWith('-')) {
      // Unmodified context line
      currentNewLine += 1;
    }
  }

  return findings;
}
