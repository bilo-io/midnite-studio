import { createHash } from 'node:crypto';

import type { SensorDefinition } from './sensor-host';

/**
 * ClickFix paste shapes (Phase 120 Theme D): command lines in an agent's terminal that match the grammar
 * of the fake-CAPTCHA attacks, found by reading the broker's output stream (read-only; *blocking* a
 * command is Phase 121 B). The matcher is pure and tested against a corpus of benign dev commands.
 */

export type ClickFixRule =
  'pipe-to-shell' | 'base64-to-shell' | 'osascript-shell' | 'hdiutil-download' | 'clear-quarantine';

const SH = String.raw`(?:sudo\s+(?:-\S+\s+)*)?(?:env\s+\S+=\S+\s+)*(?:/(?:usr/)?bin/)?(?:ba|z|da|k)?sh\b`;

const RULES: ReadonlyArray<{ rule: ClickFixRule; re: RegExp; why: string }> = [
  {
    rule: 'pipe-to-shell',
    // curl|wget ... | sh   — and the sh -c "$(curl ...)" / sh <(curl ...) spellings of the same thing.
    re: new RegExp(
      String.raw`\b(?:curl|wget)\b[^|;&\n]*\|\s*${SH}|\b(?:ba|z)?sh\s+-c\s+["']?\$\(\s*(?:curl|wget)\b|\b(?:ba|z)?sh\s+<\(\s*(?:curl|wget)\b`,
    ),
    why: 'downloads a script and runs it without reading it',
  },
  {
    rule: 'base64-to-shell',
    re: new RegExp(String.raw`\bbase64\s+(?:-[dD]|--decode)\b[^\n]*\|\s*${SH}`),
    why: 'decodes an obfuscated payload straight into a shell',
  },
  {
    rule: 'osascript-shell',
    re: /\bosascript\b[^\n]*\bdo shell script\b/i,
    why: 'uses AppleScript to run a shell command, a common ClickFix hop',
  },
  {
    rule: 'hdiutil-download',
    re: /\bhdiutil\s+attach\b[^\n]*(?:\/Downloads\/|~\/Downloads|\/tmp\/|\/private\/tmp\/|\/var\/folders\/)/,
    why: 'mounts a disk image that was just downloaded or dropped in a temp folder',
  },
  {
    rule: 'clear-quarantine',
    re: /\bxattr\b(?:\s+-\S+)*\s+-d\s+com\.apple\.quarantine\b/,
    why: 'strips the download quarantine flag so Gatekeeper does not check the file',
  },
];

export interface ClickFixMatch {
  rule: ClickFixRule;
  why: string;
}

/** Every rule the command line matches (usually none). */
export function matchClickFix(command: string): ClickFixMatch[] {
  const line = command.trim();
  if (line.length === 0 || line.length > 4_000) return [];
  return RULES.filter((r) => r.re.test(line)).map(({ rule, why }) => ({ rule, why }));
}

// eslint-disable-next-line no-control-regex -- stripping terminal escape sequences is the point
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007|\u001b[@-Z\\-_]/g;

/** One chunk of an agent pty's output, as the broker's stream delivers it. */
export interface PtyOutputChunk {
  sessionId: string;
  /** Only chunks from an agent pty are read; a plain terminal is the user's own. */
  agentId?: string;
  data: string;
}

/** The read-only seam onto the broker's output stream; the composer implements it. */
export interface PtyOutputSource {
  subscribe(listener: (chunk: PtyOutputChunk) => void): () => void;
}

export interface ClickFixDeps {
  /** Absent in a build that has not wired the broker stream yet: the sensor then idles. */
  source?: PtyOutputSource;
}

const LINE_CAP = 8_192;

export const CLICKFIX_SENSOR_ID = 'terminal-paste';

export function createClickFixSensor(deps: ClickFixDeps = {}): SensorDefinition {
  return {
    id: CLICKFIX_SENSOR_ID,
    label: 'Terminal paste shapes',
    description:
      'Reads agent terminals for ClickFix-style commands: curl piped to a shell, base64 to a shell, osascript do shell script, mounting a fresh DMG, clearing the quarantine flag.',
    schedule: { kind: 'none' },
    start(ctx) {
      if (deps.source === undefined) return;
      const partial = new Map<string, string>();
      return deps.source.subscribe((chunk) => {
        if (chunk.agentId === undefined) return;
        const text = (partial.get(chunk.sessionId) ?? '') + chunk.data.replace(ANSI, '');
        const lines = text.split(/\r?\n|\r/);
        partial.set(chunk.sessionId, (lines.pop() ?? '').slice(-LINE_CAP));
        for (const raw of lines) {
          // A prompt prefix (`% `, `$ `, `❯ `) is not part of the command.
          const command = raw.replace(/^\s*(?:\S{0,40}?[%$#>❯➜]\s+)/, '').trim();
          for (const m of matchClickFix(command)) {
            void ctx
              .record({
                fingerprint: `clickfix:${m.rule}:${createHash('sha1').update(command).digest('hex').slice(0, 16)}`,
                severity: 'high',
                category: 'process',
                title: `Risky command in an agent terminal (${m.rule})`,
                detail: `A command in the session's terminal ${m.why}.`,
                evidence: [{ kind: 'command', command: command.slice(0, 500) }],
                remediation: [{ id: 'pause-session', sessionId: chunk.sessionId }, { id: 'mute' }],
                sessionId: chunk.sessionId,
              })
              .catch((e: unknown) =>
                ctx.log('warn', `record failed: ${e instanceof Error ? e.message : String(e)}`),
              );
          }
        }
      });
    },
  };
}
