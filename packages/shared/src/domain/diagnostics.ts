import { z } from 'zod';

/**
 * Problems a repository's own tooling reports about itself.
 *
 * Unlike everything else in this package, the data here is produced by running
 * a binary that lives *in the user's repository*. That single fact shapes the
 * whole contract:
 *
 * - A command is **data**, not a string: `{ command, args[] }`, never a shell
 *   line. The runner spawns it with an argument vector, so there is no shell to
 *   quote for and nothing a filename can do to change what gets executed.
 * - A command carries the **parser that can read it**. Detection is open to any
 *   ecosystem (Go with a Makefile, a `moon.yml`, dotnet, python, C++), but a
 *   proposal is only useful if something on this side understands the output —
 *   so `parser` is part of the command, and the detector registry drops any
 *   candidate naming a parser this build does not ship.
 * - Trust is granted to a **repo *and* a command together** — see
 *   `commandFingerprint`. Changing the configured command withdraws the grant,
 *   because the prompt the user answered named the old one.
 *
 * The trust policy itself is written down in `desktop/src/main/diagnostics/` —
 * this module is the shape it travels in.
 */

/** Output formats this build can read. A new arm is a new parser module. */
export const DIAGNOSTICS_PARSERS = ['eslint'] as const;
export const DiagnosticsParserSchema = z.enum(DIAGNOSTICS_PARSERS);
export type DiagnosticsParser = z.infer<typeof DiagnosticsParserSchema>;

/**
 * What kind of project a detector recognised.
 *
 * Wider than the parser list on purpose: detection and comprehension are
 * separate problems, and this enum is the vocabulary a Go or python detector
 * will use when its parser lands. Purely descriptive — the UI labels with it,
 * nothing branches on it.
 */
export const DiagnosticsEcosystemSchema = z.enum([
  'javascript',
  'go',
  'python',
  'dotnet',
  'cpp',
  'make',
  'moon',
]);
export type DiagnosticsEcosystem = z.infer<typeof DiagnosticsEcosystemSchema>;

/**
 * Two severities, not the linter's own scale.
 *
 * eslint numbers them 0/1/2 and other tools use names, notices and "info".
 * The footer has exactly two pills, so the wire carries exactly two levels and
 * each parser is responsible for the mapping. Anything a parser cannot place is
 * dropped rather than promoted to `error`.
 */
export const DiagnosticSeveritySchema = z.enum(['error', 'warning']);
export type DiagnosticSeverity = z.infer<typeof DiagnosticSeveritySchema>;

/** One problem, at one place. */
export const DiagnosticSchema = z.object({
  /** POSIX-relative to the checkout — an absolute path is main's business. */
  file: z.string(),
  /** 1-based, or 0 when the tool reported a file-level problem with no position. */
  line: z.number().int().nonnegative(),
  column: z.number().int().nonnegative(),
  severity: DiagnosticSeveritySchema,
  /** `null` for a parse/config failure, which belongs to no rule. */
  ruleId: z.string().nullable(),
  message: z.string(),
});
export type Diagnostic = z.infer<typeof DiagnosticSchema>;

/** A command as data. Never a shell string — see the module docblock. */
export const DiagnosticsCommandSchema = z.object({
  /** Absolute path to the executable. Resolved at detect time, not from PATH. */
  command: z.string().min(1),
  args: z.array(z.string()),
  parser: DiagnosticsParserSchema,
  ecosystem: DiagnosticsEcosystemSchema,
});
export type DiagnosticsCommand = z.infer<typeof DiagnosticsCommandSchema>;

/**
 * A proposal from the detector registry.
 *
 * `evidence` is what made the detector fire, relative to the checkout, so the
 * trust prompt can say *why* this command is being offered rather than asking
 * the user to take it on faith.
 */
export const DiagnosticsCandidateSchema = DiagnosticsCommandSchema.extend({
  detectorId: z.string().min(1),
  label: z.string().min(1),
  evidence: z.array(z.string()),
});
export type DiagnosticsCandidate = z.infer<typeof DiagnosticsCandidateSchema>;

/**
 * Why a run produced nothing. Every one of these is an ordinary outcome the
 * footer renders — none is an exception.
 *
 * - `no-command`   — nothing configured, and detection found nothing to offer
 * - `untrusted`    — configured, but the user has not approved *this* command
 * - `not-installed`— the executable is gone (a `node_modules` wipe, a moved repo)
 * - `timed-out`    — killed at the deadline
 * - `parse-failed` — it ran and said something the parser could not read
 */
export const DIAGNOSTICS_REASONS = [
  'no-command',
  'untrusted',
  'not-installed',
  'timed-out',
  'parse-failed',
] as const;
export const DiagnosticsReasonSchema = z.enum(DIAGNOSTICS_REASONS);
export type DiagnosticsReason = z.infer<typeof DiagnosticsReasonSchema>;

/**
 * How many rows cross the wire. Counts are always complete; the list is not.
 *
 * A repository mid-refactor can report tens of thousands of problems, and the
 * flyout shows a scrollable page of them at most. `withheld` is what makes the
 * cap honest — the same rule Phase 17's expand-all limit follows: say what was
 * not shown rather than let a truncated list read as the whole story.
 */
export const DIAGNOSTICS_ROW_CAP = 500;

/** The result of one run. */
export const DiagnosticsRunSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    /** Complete, even when `rows` is capped. */
    errorCount: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative(),
    rows: z.array(DiagnosticSchema),
    /** Rows counted but not sent. Zero means `rows` is the whole story. */
    withheld: z.number().int().nonnegative(),
    /** Epoch ms, stamped in main — the renderer shows "measured 4m ago". */
    ranAt: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative(),
  }),
  z.object({
    ok: z.literal(false),
    reason: DiagnosticsReasonSchema,
    /** One sentence for the UI. Never a stack trace. */
    hint: z.string(),
  }),
]);
export type DiagnosticsRun = z.infer<typeof DiagnosticsRunSchema>;

/**
 * Where a repository stands with the trust boundary.
 *
 * `command-changed` is deliberately not folded into `untrusted`: the two look
 * identical to a state machine and completely different to a person. One is
 * "you have never enabled this", the other is "the command you approved is not
 * the command that would run now" — and the second is the one worth reading.
 */
export const DiagnosticsTrustStateSchema = z.enum([
  'no-command',
  'untrusted',
  'trusted',
  'command-changed',
]);
export type DiagnosticsTrustState = z.infer<typeof DiagnosticsTrustStateSchema>;

export const DiagnosticsTrustStatusSchema = z.object({
  state: DiagnosticsTrustStateSchema,
  /** The configured command, or `null` when there is none. */
  command: DiagnosticsCommandSchema.nullable(),
  /** Epoch ms of the grant, or `null` when nothing is granted. */
  trustedAt: z.number().int().nonnegative().nullable(),
});
export type DiagnosticsTrustStatus = z.infer<typeof DiagnosticsTrustStatusSchema>;

/**
 * The identity a trust grant is recorded against.
 *
 * Lives in `shared` rather than in main because both sides have to agree on it:
 * main decides whether a grant still applies, and the renderer decides whether
 * to re-prompt. Two implementations of "is this the same command" would
 * eventually disagree, and the failure mode is silent execution of something
 * the user never approved.
 *
 * NUL-joined for the same reason the git parsers are: an argument may contain
 * spaces, newlines and quotes, and any printable separator makes
 * `["a b"]` and `["a", "b"]` fingerprint alike.
 */
export function commandFingerprint(command: DiagnosticsCommand): string {
  return [command.parser, command.command, ...command.args].join('\0');
}

/**
 * The command as a person reads it, for the trust prompt and the settings page.
 *
 * Space-joined, and therefore lossy in exactly the way
 * {@link commandFingerprint} refuses to be — which is the point. This string is
 * shown to a human deciding whether to approve an execution; the fingerprint is
 * what decides whether the approval still holds. Using one for the other would
 * either make the prompt unreadable or make two different commands compare
 * equal, so they are deliberately separate functions over the same value.
 */
export function commandLine(command: DiagnosticsCommand): string {
  return [command.command, ...command.args].join(' ');
}
