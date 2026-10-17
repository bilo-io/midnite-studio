/**
 * The logger the games' main half writes to (Phase 113 Theme S) — structurally the desktop's `Logger`
 * (`log.ts`), declared here so the package needs no import from an app. Studio hands in its own;
 * Gamer a console-backed one.
 */
export type Logger = ((message: string) => void) & {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, err?: unknown): void;
};
