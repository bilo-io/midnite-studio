import { z } from 'zod';

/**
 * The result envelope every mutating op returns.
 *
 * Ops NEVER throw across IPC. A merge conflict is an expected outcome the UI
 * renders (conflict banner + abort/continue), not an exception — and an
 * exception crossing `ipcRenderer.invoke` arrives as an opaque
 * `Error: Error invoking remote method ...` string with the real stderr lost.
 * Everything therefore comes back as this discriminated union.
 */
export const ConflictOpSchema = z.enum(['merge', 'rebase', 'cherry-pick', 'revert']);
export type ConflictOp = z.infer<typeof ConflictOpSchema>;

/**
 * The two failure arms, discriminated on `kind`.
 *
 * Split out because zod's `discriminatedUnion` requires every arm to hold a
 * DISTINCT value for the discriminator, and both failures share `ok: false`.
 * Nesting keeps the wire shape exactly as specified — `{ok:false, kind:…}` —
 * while still giving zod a single-key fast path within each level, and TypeScript
 * narrows through both keys just the same.
 */
const GitOpFailureSchema = z.discriminatedUnion('kind', [
  z.object({
    ok: z.literal(false),
    kind: z.literal('conflict'),
    /** Repo-relative paths currently unmerged. */
    files: z.array(z.string()),
    op: ConflictOpSchema,
  }),
  z.object({
    ok: z.literal(false),
    kind: z.literal('error'),
    /** Human-readable, already mapped from git's stderr where we recognise it. */
    message: z.string(),
    /** Raw stderr, kept for the "details" disclosure. */
    stderr: z.string().optional(),
  }),
]);

export const GitOpResultSchema = z.union([z.object({ ok: z.literal(true) }), GitOpFailureSchema]);
export type GitOpResult = z.infer<typeof GitOpResultSchema>;

export const ok = (): GitOpResult => ({ ok: true });

export const conflict = (op: ConflictOp, files: string[]): GitOpResult => ({
  ok: false,
  kind: 'conflict',
  op,
  files,
});

export const failure = (message: string, stderr?: string): GitOpResult => ({
  ok: false,
  kind: 'error',
  message,
  ...(stderr === undefined ? {} : { stderr }),
});
