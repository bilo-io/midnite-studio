# Dock identity spike (Phase 113 Theme B)

```sh
node scripts/spikes/dock-identity/dock-identity.mjs <outDir> [--idle=10] [--keep]
```

Builds throwaway runtime and stub `.app` bundles from the repo's Electron under `<outDir>` (never
`/Applications`), launches them, reads what macOS registers (`lsappinfo`, System Events), sums
process-tree RSS from `ps` after the idle window, ad-hoc signs and assesses each bundle, then quits
everything and writes `<outDir>/results.json` plus `<outDir>/observations/*.txt`. It never captures
the screen. Findings: [`docs/spikes/dock-identity.md`](../../../docs/spikes/dock-identity.md).

It opens a few small windows for about a minute. macOS only.
