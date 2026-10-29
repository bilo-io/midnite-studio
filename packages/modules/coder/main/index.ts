// The Coder module's main half (Phase 124 Theme C). The window, identity and pairing stay with the host
// app; everything below is module logic that takes what it needs from the host (an `ipcMain`-shaped
// registrar, dialogs, the vault directory) and never imports `electron`.
//
// Coder registers through its own composer (`registerCoderHandlers`, the app-composer pattern over the
// forge, tests, API client, database and sessions features' mains) rather than one `defineFeatureMain`;
// folding it into `mountModuleMains` is Theme E.3's wiring.
export { registerCoderHandlers, type CoderElectron } from './context';
export { createCoderBridge, type CoderBridge, type RendererIpc } from './bridge';
export { CODER_GIT_CHANNELS, registerCoderGit, type CoderGitServices } from './git';
export { createCoderRepos, isGitCheckout, type CoderRepos } from './repos';
export { GitProcess, NO_GIT, resolveSystemGit, systemGit, type GitBinary, type GitProbe } from './system-git';
