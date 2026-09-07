/**
 * Phase 70 Theme B — the one hand-maintained description of the `pm.*`
 * surface a test/pre-request script may use, in the one package both halves
 * that need it already import.
 *
 * Two very different consumers read this same list:
 *
 * - `main/api-client/script-runner.ts` (desktop) is the **implementation** —
 *   the sandbox's allow-list is real JS values, which this file (zod-only,
 *   no runtime behaviour) cannot express, so that module does not import
 *   from here at all. What keeps the two from drifting apart is
 *   `script-runner.test.ts`'s "every pinned method, exercised individually"
 *   requirement: a method this file's `.d.ts` advertises but the sandbox
 *   does not implement fails that suite the moment a test tries to call it.
 * - `features/api-client/test-editor.tsx` (app) is the **typing** — it
 *   registers `PM_AMBIENT_DTS` with Monaco's JavaScript language service via
 *   `addExtraLib`, so the pinned surface autocompletes in the Scripts tab
 *   and an unsupported call (`pm.sendRequest`, chained requests are out of
 *   scope entirely — see the phase doc's scope guardrails) red-squiggles at
 *   author time instead of only failing at run time with a `TypeError`.
 *
 * Keeping the text in one file, imported by the one package both app and
 * desktop already depend on, is what "in one file, so the two cannot drift"
 * (the phase doc's own words for this) actually means in a repo where app
 * cannot import from desktop and desktop cannot import Monaco.
 */
export const PM_AMBIENT_DTS = `
/** A single \`pm.test\` assertion result — pass or fail, never thrown. */
interface PmAssertion {
  to: PmAssertion;
  not: PmAssertion;
  be: PmAssertionBe;
  have: PmAssertionHave;
  /** Strict (\`===\`) equality. */
  equal(expected: unknown): void;
  /** Deep equality. */
  eql(expected: unknown): void;
  /** Array/string \`.includes\`, or object key presence for a plain object. */
  include(expected: unknown): void;
}

interface PmAssertionBe {
  to: PmAssertion;
  not: PmAssertion;
  readonly true: void;
  readonly false: void;
  readonly null: void;
  readonly undefined: void;
  /** \`typeof\` for every type name, and \`Array.isArray\` for \`'array'\`. */
  a(type: string): void;
  above(n: number): void;
  below(n: number): void;
}

interface PmAssertionHave {
  to: PmAssertion;
  not: PmAssertion;
  property(key: string): void;
  /** Shorthand for \`pm.response.code === n\` — call on \`pm.expect(pm.response)\`. */
  status(n: number): void;
}

interface PmHeaders {
  /** Case-insensitive header lookup; \`undefined\` when absent. */
  get(name: string): string | undefined;
}

interface PmRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: PmHeaders;
}

interface PmResponse {
  readonly code: number;
  readonly status: string;
  readonly headers: PmHeaders;
  /** Throws if the body is not valid JSON. */
  json(): unknown;
  text(): string;
}

interface PmVariableScope {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
}

interface Pm {
  /** Runs \`fn\` as one named assertion; a throw inside becomes a failed result
   *  for this test only — every other \`pm.test\` in the script still runs. */
  test(name: string, fn: () => void): void;
  expect(actual: unknown): PmAssertion;
  /** Read-only merge: environment shadows collection — the same order
   *  \`interpolate.ts\` resolves \`{{var}}\` in. */
  variables: { get(key: string): string | undefined };
  environment: PmVariableScope;
  collectionVariables: PmVariableScope;
  /** The draft as this app holds it — \`{{var}}\` tokens unresolved. Never the
   *  interpolated wire request, which can carry a secret. */
  request: PmRequest;
  /** \`null\` in a Pre-request Script — there is no response yet. */
  response: PmResponse | null;
}

declare const pm: Pm;
`;
