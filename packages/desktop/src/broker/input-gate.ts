/**
 * Holds a launcher's command back until the shell is actually reading its
 * line editor, then writes it exactly once.
 *
 * Why not "on the first byte of output": the first chunk a login shell prints
 * (a title escape, a prompt-framework banner, zsh's instant prompt) arrives
 * BEFORE zle has put the tty in raw mode, and zsh's switch to raw mode flushes
 * whatever is queued on the tty. Typing at the first chunk therefore dropped
 * the first character(s) intermittently (`claude` -> `laude`), more often the
 * slower the rc files.
 *
 * Ready signal, strongest first:
 *  1. `ESC[?2004h` — bracketed-paste enable, which zle, readline (bash 5.1+)
 *     and fish emit right as they start reading. Exact, and shell-speed proof.
 *  2. Output went quiet for `quietMs` after having started — for shells that
 *     never emit it (dash, older bash).
 *  3. `maxWaitMs` since spawn — a shell that prints nothing at all must still
 *     get its command.
 */
export const BRACKETED_PASTE_ON = '\x1b[?2004h';

export type InputGateOptions = {
  input: string;
  write: (input: string) => void;
  quietMs?: number;
  maxWaitMs?: number;
  /** Injectable for tests. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export type InputGate = {
  /** Feed every chunk the pty prints, in order. */
  onData: (chunk: string) => void;
  /** Cancel the pending write (the pty exited first). */
  dispose: () => void;
  readonly fired: boolean;
};

export function createInputGate(options: InputGateOptions): InputGate {
  const quietMs = options.quietMs ?? 250;
  const maxWaitMs = options.maxWaitMs ?? 4000;
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let fired = false;
  let tail = '';
  let quietTimer: unknown = null;
  let maxTimer: unknown = null;

  const fire = (): void => {
    if (fired) return;
    fired = true;
    if (quietTimer !== null) clearTimer(quietTimer);
    if (maxTimer !== null) clearTimer(maxTimer);
    quietTimer = maxTimer = null;
    options.write(options.input);
  };

  maxTimer = setTimer(fire, maxWaitMs);

  return {
    onData(chunk) {
      if (fired) return;
      // The marker can straddle two chunks; keep just enough of the last one.
      const window = tail + chunk;
      tail = window.slice(-(BRACKETED_PASTE_ON.length - 1));
      if (window.includes(BRACKETED_PASTE_ON)) {
        fire();
        return;
      }
      if (quietTimer !== null) clearTimer(quietTimer);
      quietTimer = setTimer(fire, quietMs);
    },
    dispose() {
      fired = true;
      if (quietTimer !== null) clearTimer(quietTimer);
      if (maxTimer !== null) clearTimer(maxTimer);
      quietTimer = maxTimer = null;
    },
    get fired() {
      return fired;
    },
  };
}
