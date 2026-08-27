import type { SessionActivity } from './terminal-store';

/**
 * Guesses at what an agent is doing, read off the same text a human would.
 *
 * There is no structured signal for this — an agent CLI is just a process
 * writing bytes to a pty — so the guess is keyed on strings Claude Code's own
 * TUI prints: "(esc to interrupt)" while it is generating or running a tool,
 * and the idle footer's "shift+tab to cycle" / "auto mode on" once it is back
 * at a prompt waiting on you. A chunk carrying neither leaves the previous
 * guess alone — most chunks are pure content and say nothing about state
 * either way, so `undefined` here means "no change", not "unknown".
 */
const THINKING_MARKER = /esc to interrupt/i;
const WAITING_MARKER = /shift\+tab to cycle|auto mode on/i;

export function detectActivity(text: string): SessionActivity | undefined {
  if (THINKING_MARKER.test(text)) return 'thinking';
  if (WAITING_MARKER.test(text)) return 'waiting';
  return undefined;
}

export type ShellLineState = { buffer: string; inEscape: boolean };

export const createShellLineState = (): ShellLineState => ({ buffer: '', inEscape: false });

/**
 * Feeds one chunk of a shell session's OWN keystrokes (not its output) into a
 * running line buffer, and returns the command word to show once Enter is
 * pressed — or `null` when nothing finished in this chunk.
 *
 * A lightweight parser, not a real terminal-input state machine: it tracks
 * printable characters and backspace, and skips escape sequences (arrow keys,
 * bracketed-paste markers) wholesale rather than interpreting them. Good
 * enough for "what did they last run", not good enough for line editing.
 */
export function trackShellCommand(state: ShellLineState, data: string): string | null {
  let finished: string | null = null;
  for (const ch of data) {
    if (state.inEscape) {
      if (/[A-Za-z~]/.test(ch)) state.inEscape = false;
      continue;
    }
    if (ch === '\x1b') {
      state.inEscape = true;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      const line = state.buffer.trim();
      state.buffer = '';
      if (line) finished = line.split(/\s+/)[0]!;
      continue;
    }
    if (ch === '\x7f' || ch === '\b') {
      state.buffer = state.buffer.slice(0, -1);
      continue;
    }
    if (ch >= ' ') state.buffer += ch;
  }
  return finished;
}
