# Vendored `@bilo-io/ui-native` 0.5.0 (stand-in)

- **Source:** `bilo-io/midnite-ui`, `packages/ui-native/src` at commit `2b03986ac92a80411d41a8b68747421929304ce1` (the #19 merge, version 0.5.0), plus its `LICENSE`.
- **Verbatim:** no file here is edited. Test files (`*.test.ts(x)`) were left out.
- **Why:** 0.5.0 is built and merged but could not be published (GitHub Packages refused it: billing limit), and Theme F needs its `AppBar`, `BottomNav`, `Sheet`, `SpeedDial` and friends. Its one runtime import, `@bilo-io/ui/tokens`, comes from the published `@bilo-io/ui@0.5.0`, a real dependency of `apps/mobile`.
- **Types:** `../ui-native-types/index.d.ts` is the package's own built declaration file (`dist/index.d.ts` from the same commit). `tsc` reads it through `paths` instead of the vendored source, because that source was written against React Native 0.86 types and does not type-check under this app's 0.88 (ref types differ). Metro and vitest still run the vendored source.
- **Wiring:** the module id `@bilo-io/ui-native` is aliased to `vendor/ui-native/index.ts` in `tsconfig.json` (`paths`), `vitest.config.ts` (`alias`) and `metro.config.js` (`resolveRequest`). Metro also needs `metro-shims/` for the two brand PNGs, which the vendored source imports with Vite's `?inline`. No call site imports the vendor path.

## Removal, once `@bilo-io/ui-native@^0.5.0` is published

1. `pnpm -C apps/mobile add @bilo-io/ui-native@^0.5.0` (and drop the now-redundant `@bilo-io/ui` dependency if nothing else uses it).
2. Delete the `@bilo-io/ui-native` entry (and its comment) from `tsconfig.json` `paths`, `vitest.config.ts` `alias` and `metro.config.js` `resolveRequest`.
3. `git rm -r apps/mobile/metro-shims` (the Metro stand-in for the vendored brand PNGs' Vite `?inline` imports) and `git rm -r apps/mobile/vendor` (both `ui-native` and `ui-native-types`) and remove the `vendor/**` and `metro-shims/**` entries from `eslint.config.mjs` ignores (and the `?inline` branch in `metro.config.js`).
4. Run `pnpm -C apps/mobile exec tsc --noEmit` and `vitest run`. No source file changes, because every call site already imports `@bilo-io/ui-native`.
