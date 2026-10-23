import type { AgentAuditCommandSource } from '@midnite/studio-shared';

/**
 * Turns an agent pty's keystrokes and output into command lines for the audit trail — Phase 121 Theme G.
 *
 * Pure: no timers, no I/O, no `electron`. The host feeds it what is written to a pty ({@link CommandTracker.input})
 * and what the pty prints ({@link CommandTracker.output}) and gets a callback per command.
 *
 * - **Marks when the shell emits them.** A shell with OSC 133 prompt marks (`A` prompt, `B` input,
 *   `C` command start, `D` end) or VS Code's OSC 633 (`E;<command>` carries the text) is trusted: a typed line
 *   is held until the `C` mark confirms the shell ran it, and `633;E` is used verbatim. A prompt mark clears a
 *   held line, so text typed at a program's own prompt (a password) is never reported.
 * - **A line heuristic otherwise.** With no marks seen for the session, a typed line is reported at Enter,
 *   except when the last output ended in a password-style prompt.
 *
 * Limitation, by design: text typed into an agent CLI's own prompt looks like a typed line to the heuristic.
 */
export interface TrackedCommand {
  sessionId: string;
  command: string;
  source: AgentAuditCommandSource;
}

export interface CommandTracker {
  /** Bytes written to the pty (keystrokes, pastes). */
  input(sessionId: string, data: string): void;
  /** Text the pty printed. */
  output(sessionId: string, data: string): void;
  /** Drop a session's state when it ends. */
  end(sessionId: string): void;
}

const MAX_LINE = 4000;
const PASSWORD_PROMPT = /(pass(?:word|phrase|code)|\bpin\b|secret|token)[^\n]{0,60}[:?]\s*$/i;
// eslint-disable-next-line no-control-regex
const ESCAPES = /\x1b\[[0-9;?<=>]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]|\x1bO./g;
// eslint-disable-next-line no-control-regex
const OSC = /\x1b\](133|633);([^\x07\x1b]*)(?:\x07|\x1b\\)/g;

interface State {
  line: string;
  marked: boolean;
  pending: string | null;
  tail: string;
  /** An unterminated OSC at the end of the last chunk. */
  carry: string;
}

function unescape633(text: string): string {
  return text.replace(/\\x([0-9a-fA-F]{2})|\\\\/g, (m, hex: string | undefined) => (hex ? String.fromCharCode(parseInt(hex, 16)) : '\\'));
}

export function createCommandTracker(emit: (command: TrackedCommand) => void): CommandTracker {
  const states = new Map<string, State>();
  const stateOf = (id: string): State => {
    let s = states.get(id);
    if (!s) states.set(id, (s = { line: '', marked: false, pending: null, tail: '', carry: '' }));
    return s;
  };
  const report = (sessionId: string, command: string, source: AgentAuditCommandSource): void => {
    const trimmed = command.trim();
    if (trimmed === '') return;
    try {
      emit({ sessionId, command: trimmed, source });
    } catch {
      // A listener must never break a terminal.
    }
  };

  return {
    input(sessionId, data) {
      const s = stateOf(sessionId);
      const text = data.replace(ESCAPES, '');
      for (const ch of text) {
        if (ch === '\r' || ch === '\n') {
          const line = s.line;
          s.line = '';
          if (line.trim() === '') continue;
          if (s.marked) s.pending = line;
          else if (!PASSWORD_PROMPT.test(s.tail)) report(sessionId, line, 'heuristic');
        } else if (ch === '\x7f' || ch === '\b') {
          s.line = s.line.slice(0, -1);
        } else if (ch === '\x15' || ch === '\x03' || ch === '\x04') {
          s.line = '';
        } else if (ch >= ' ' && s.line.length < MAX_LINE) {
          s.line += ch;
        }
      }
    },

    output(sessionId, data) {
      const s = stateOf(sessionId);
      let text = s.carry + data;
      s.carry = '';
      const open = text.lastIndexOf('\x1b]');
      // eslint-disable-next-line no-control-regex
      if (open !== -1 && !/\x07|\x1b\\/.test(text.slice(open))) {
        s.carry = text.slice(open, open + 2048);
        text = text.slice(0, open);
      }
      for (const match of text.matchAll(OSC)) {
        s.marked = true;
        const [, family, payload = ''] = match;
        if (family === '633' && payload.startsWith('E;')) {
          s.pending = null;
          report(sessionId, unescape633(payload.slice(2).split(';')[0] ?? ''), 'osc-633');
        } else if (family === '133' && payload.startsWith('C')) {
          if (s.pending !== null) report(sessionId, s.pending, 'osc-133');
          s.pending = null;
        } else if (payload.startsWith('A')) {
          s.pending = null;
        }
      }
      s.tail = (s.tail + text.replace(ESCAPES, '').replace(OSC, '')).slice(-200);
    },

    end(sessionId) {
      states.delete(sessionId);
    },
  };
}
