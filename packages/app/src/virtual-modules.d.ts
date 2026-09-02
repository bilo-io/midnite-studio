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
