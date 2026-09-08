/**
 * The agent marks `react-icons` does not ship.
 *
 * Four of the ten agents in the roster have a real glyph in `react-icons/si`
 * (`SiCursor`, `SiGithubcopilot`, `SiCline`, `SiOpencode`) and are imported
 * directly in `../agents.ts`. These six do not, so they are hand-held SVGs —
 * each one carrying its own provenance and licence note, which is what
 * `docs/INITIAL_PLAN.md` asks of any third-party asset.
 *
 * They are **copies** of `packages/app/src/components/icons/`, not imports of
 * it: the eslint boundary for this package denies `@midnite/studio-app`
 * outright, and it is right to — the site has to stay liftable out of this
 * monorepo. The cost is that a redrawn mark has to be copied twice; the note in
 * each file says where its twin lives.
 */
export { AiderIcon } from './aider-icon';
export { AntigravityIcon } from './antigravity-icon';
export { ClaudeIcon } from './claude-icon';
export { CodexIcon } from './codex-icon';
export { KiloIcon } from './kilo-icon';
export { OpenClaudeIcon } from './openclaude-icon';
