/**
 * Phase 66 Theme E — `{{var}}` interpolation, resolved in **main**.
 *
 * This runs here rather than in the renderer so a secret never lives in
 * renderer state (Phase 70 Theme A adds the environment tier at this same
 * call site, which is why interpolation lives in main from day one rather
 * than being moved later).
 *
 * Two rules from the phase doc's Decision 7 shape the whole file:
 *
 * 1. **An unresolved `{{var}}` is left literally in place** and named in a
 *    warning — never substituted with an empty string. Substituting produces
 *    `https://api./users` and a 404 that reads as the server's fault; leaving
 *    the token in produces an obviously-wrong URL and a named warning.
 * 2. **One pass, no recursion into resolved values.** A collection is a file
 *    the user did not necessarily write, and a self-referential variable
 *    (`a = "{{b}}"`, `b = "{{a}}"`) must not be able to hang the main process.
 */

/**
 * A `{{name}}` token, where the braces are exactly doubled.
 *
 * The lookarounds are what make `{{{{a}}}}` a non-match rather than a match on
 * its inner `{{a}}`: the only `{{` not preceded by `{` is at index 0, and that
 * one is followed by `{`. Without them a naive scan slides right and "finds"
 * the inner token, which is the opposite of leaving an over-braced literal
 * alone. `[^{}]` in the name keeps a brace from ever being part of a variable.
 */
const TOKEN = /(?<!\{)\{\{(?!\{)\s*([^{}\s][^{}]*?)\s*\}\}(?!\})/g;

export interface InterpolationResult {
  /** The input with every resolvable token replaced; unresolved ones intact. */
  text: string;
  /** One entry per distinct unresolved name, in first-seen order. */
  warnings: string[];
}

/**
 * Replace `{{name}}` tokens in `input` from `variables`, in a single pass.
 *
 * A resolved value is inserted verbatim and **not** re-scanned, so a value
 * that itself contains `{{b}}` keeps that token literally.
 */
export function interpolate(
  input: string,
  variables: Readonly<Record<string, string>>,
): InterpolationResult {
  const unresolved: string[] = [];

  // `replace` with a function walks the input once and never revisits the
  // text it has already emitted — that is the "one pass, no recursion"
  // property, enforced structurally rather than by a depth counter.
  const text = input.replace(TOKEN, (whole, rawName: string) => {
    const name = rawName.trim();
    if (Object.prototype.hasOwnProperty.call(variables, name)) {
      return variables[name];
    }
    if (!unresolved.includes(name)) unresolved.push(name);
    return whole;
  });

  return {
    text,
    warnings: unresolved.map((name) => `Unresolved variable {{${name}}} — left as-is.`),
  };
}

/**
 * `interpolate` over several strings at once, merging their warnings and
 * de-duplicating by message so one unresolved variable used in the URL *and*
 * three headers reports once, not four times.
 */
export function interpolateAll(
  inputs: readonly string[],
  variables: Readonly<Record<string, string>>,
): { texts: string[]; warnings: string[] } {
  const texts: string[] = [];
  const warnings: string[] = [];
  for (const input of inputs) {
    const result = interpolate(input, variables);
    texts.push(result.text);
    for (const warning of result.warnings) {
      if (!warnings.includes(warning)) warnings.push(warning);
    }
  }
  return { texts, warnings };
}
