# Task
W6b/H2: Cleaner main+preload so installed bundle runs. Branch feature/p113-h-ship. No merge, no /Applications.
## Decisions
- Main side in apps/cleaner/main/ (not src/: src is renderer-linted). New eslint block.
- Services are standalone/"not ported" stubs (Studio's live in desktop, can't import) -> H3 friction.
- Bundle: dist/main.cjs + preload.cjs via esbuild after vite; package.json main=main.cjs (pack step).
- Smoke env MIDNITE_CLEANER_SMOKE=1 + MIDNITE_CLEANER_USER_DATA, prints midnite-cleaner:ready.
## Done
preload/bridge, context, services, index, bundle-main.mjs, tests (11)
## Next
pack step in release.yml + release-bundles.test; verifyAppBundle main check; launcher e2e script (temp roots); smoke launch; gate; PR
