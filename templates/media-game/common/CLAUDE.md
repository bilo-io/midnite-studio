# {{GAME_NAME}}

A game made in Midnite Studio. This repository is the game: plain ES modules, no build step.

- `index.html` loads `src/main.js` as a module. Edit files in `src/`.
- `midnite-game.json` is the manifest Midnite Studio reads. You may add keys to it; do not remove the ones it has.
- Midnite Studio runs the game in a sandbox with no network. Anything the game prints with `console.log`, and any uncaught error, is shown in the console under the game.
- Keep the game runnable after every change. Commit logical steps.
- Do not add a bundler or a `package.json` build step.
