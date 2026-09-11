/**
 * Virtual modules this package's build config supplies.
 *
 * `virtual:midnite-styles-raw` is answered only by `vitest.config.ts` — it
 * hands `styles.css`'s own text to `loop-spectrum.test.ts`, which asserts that
 * every FAB loop declares the sub-spectrum its arc implies. It deliberately
 * has no `.css` extension: vitest stubs CSS imports to an empty string by
 * extension, `?raw` included.
 */
declare module 'virtual:midnite-styles-raw' {
  const css: string;
  export default css;
}

/**
 * `virtual:midnite-tailwind-config-raw` — Phase 84 Theme K.6, `vitest.config.ts`'s
 * sibling seam for `tailwind.config.ts`'s own text, for the same reason and
 * the same no-real-extension trick: `styles-motion-guards.test.ts` needs to
 * see the `keyframes` Tailwind generates at build time, which never appear
 * in `styles.css` as literal `@keyframes` for `virtual:midnite-styles-raw`
 * above to already cover.
 */
declare module 'virtual:midnite-tailwind-config-raw' {
  const source: string;
  export default source;
}
