# Module package template (Phase 124 Theme B)

Not a package: every file is a `.tmpl`, so pnpm and moon skip this folder. To add a module, copy it to
`packages/modules/<id>/`, drop the `.tmpl` suffixes, replace `__ID__` / `__LABEL__`, add the project to
`NODE_PROJECTS` in `scripts/gate-projects-check.mjs`, and run `pnpm install`. Layer rules are in
`docs/APPS.md` and `eslint.config.mjs` (a module may import features, the frame and shared; never an
app or another module).
