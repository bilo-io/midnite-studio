// The Coder module's main half (Phase 124 Theme C). The window, identity and pairing stay with the host
// app; everything below is module logic that takes what it needs from the host (an `ipcMain`-shaped
// registrar, dialogs, the vault directory) and never imports `electron`.
//
// Coder mounts through `coderModuleMain` (`module.ts`, Phase 124 Theme E.3); `registerCoderHandlers` stays for
// Coder's own app.
export { registerCoderHandlers, registerCoderOn, type CoderElectron } from './context';
export { createCoderBridge, type CoderBridge, type RendererIpc } from './bridge';
export { CODER_GIT_CHANNELS, registerCoderGit, type CoderGitServices } from './git';
export { createCoderRepos, isGitCheckout, type CoderRepos } from './repos';
export { GitProcess, NO_GIT, resolveSystemGit, systemGit, type GitBinary, type GitProbe } from './system-git';
export { coderModuleMain, type CoderModuleServices } from './module';
