/**
 * The process seam the integrity sensor runs `git`, `codesign` and `spctl` through. Structurally the
 * sensor host's `SensorRunProcess` (Phase 120 B): one trusted command, an argument vector, no shell, never
 * rejects. The composer binds the runtime's `runProcess`.
 */
export type IntegrityRunProcessResult =
  | { ok: true; stdout: string; stderr: string; exitCode: number | null }
  | { ok: false; reason: 'not-installed' | 'timed-out' | 'failed'; hint: string };

export type IntegrityRunProcess = (
  command: string,
  args: readonly string[],
  options?: { cwd?: string; timeoutMs?: number },
) => Promise<IntegrityRunProcessResult>;
