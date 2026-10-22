/**
 * The ClickFix shape matcher (Phase 117 Theme G).
 *
 * ClickFix is a fake CAPTCHA or "verify you are human" page that copies a shell command to the
 * clipboard and tells the user to paste it into Terminal. On macOS the payload is usually a
 * `curl … | bash` loader for an infostealer that then strips Gatekeeper's quarantine attribute.
 *
 * This module answers one question about a piece of text: does it look like a command meant to be
 * pasted into a shell? It is pure, so the Browser's clipboard watch and Phase 120's system-wide rule
 * (Vanguard) share one matcher and cannot disagree about what a lure looks like.
 *
 * It is deliberately narrow. A URL or prose on the clipboard never matches; only text that carries
 * one of the shapes below does. A false negative leaves the user where they were before this rule
 * existed, while a false positive shows a warning about something harmless, so the list stays short.
 */

export type ClickFixReason =
  | 'pipe-to-shell'
  | 'base64-decode'
  | 'osascript'
  | 'quarantine-strip'
  | 'powershell-encoded';

export type ClickFixMatch = { reason: ClickFixReason; label: string };

/** Longest clipboard text inspected. A lure is one line; a 1 MB paste is not one. */
export const CLICKFIX_MAX_INSPECT = 8 * 1024;

const RULES: ReadonlyArray<{ reason: ClickFixReason; label: string; pattern: RegExp }> = [
  {
    reason: 'pipe-to-shell',
    label: 'downloads a script and pipes it into a shell',
    // `curl …| bash`, `wget -qO- … | sh`, `curl … | sudo zsh`, `| /bin/bash`.
    pattern: /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:\/bin\/|\/usr\/bin\/(?:env\s+)?)?(?:ba|z|da|k)?sh\b/i,
  },
  {
    reason: 'pipe-to-shell',
    label: 'downloads a script and runs it in a shell',
    // `/bin/bash -c "$(curl -fsSL …)"` — the installer form most ClickFix lures copy.
    pattern: /\b(?:ba|z|da|k)?sh\s+-c\s+["']?\$\(\s*(?:curl|wget)\b/i,
  },
  {
    reason: 'base64-decode',
    label: 'decodes a hidden base64 payload',
    pattern: /\bbase64\s+(?:-d|--decode|-D)\b/i,
  },
  {
    reason: 'osascript',
    label: 'runs AppleScript from the command line',
    pattern: /\bosascript\s+-e\b/i,
  },
  {
    reason: 'quarantine-strip',
    label: "removes macOS's download quarantine",
    // A delete (`-d`) or clear (`-c`) flag, alone or combined (`-rd`, `-cr`); `xattr -p` (print) is fine.
    pattern: /\bxattr\s+(?:-[a-z]*\s+)*-[a-z]*[dc][a-z]*\b/i,
  },
  {
    reason: 'powershell-encoded',
    label: 'runs an encoded PowerShell command',
    pattern: /\bpowershell(?:\.exe)?\b[^\n]*\s-(?:e|enc|encodedcommand)\b/i,
  },
];

/**
 * The first shape `text` matches, or `null`. Only the first {@link CLICKFIX_MAX_INSPECT} characters
 * are read.
 */
export function matchClickFixCommand(text: string): ClickFixMatch | null {
  if (typeof text !== 'string' || text.length === 0) return null;
  const head = text.slice(0, CLICKFIX_MAX_INSPECT);
  for (const rule of RULES) {
    if (rule.pattern.test(head)) return { reason: rule.reason, label: rule.label };
  }
  return null;
}

/** A short, single-line preview of a clipboard command for a warning bar. Never the whole payload. */
export function clickFixPreview(text: string, max = 96): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
