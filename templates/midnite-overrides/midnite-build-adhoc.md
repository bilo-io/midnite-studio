# midnite-build-adhoc

The moon gate is this repo's; the focused script assumes a JS workspace.

<<<<
(focused vitest, `tsc --noEmit` and eslint for the packages the diff touches; never the workspace-wide moon gate, which exhausts RAM).
====
(focused vitest, `tsc --noEmit` and eslint for the packages the diff touches; outside a JS workspace run the project's focused equivalents, and leave the full gate to CI).
>>>>
