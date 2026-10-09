# {{GAME_NAME}}

A game made in Midnite Studio. This repository is the game: plain ES modules, no build step.

- `index.html` loads `src/main.js` as a module. Edit files in `src/`.
- `midnite-game.json` is the manifest Midnite Studio reads. You may add keys to it; do not remove the ones it has.
- Midnite Studio runs the game in a sandbox with no network. Anything the game prints with `console.log`, and any uncaught error, is shown in the console under the game.
- Keep the game runnable after every change. Commit logical steps.
- Do not add a bundler or a `package.json` build step.
- Skills for working in this repo are in `.claude/skills`, `.agents/skills` and `.codex/skills`: start with `midnite-media-game-build`, then the recipe for your genre (`midnite-media-game-<genre>`).

## Fidelity and juice kit

The kit ships procedural textures and normal maps, game-feel effects (shake, hit-stop, flashes, squash, particles, post-processing) and synthesized sound effects, all on by default and deterministic. Settings, the API and the worked examples are in the `midnite-media-game-build` skill, section "Fidelity and juice kit"; `src/scenes/level.js` in the third-person and platformer bases shows it wired in. Turn it off for a screenshot with `?juice=off` or `window.__midnite.juice.off()`.
