// The Creator module's main half (Phase 124 Theme C). The window, identity and pairing stay with the host
// app; everything below is module logic that takes what it needs from the host (an `ipcMain`-shaped
// registrar, the media root, dialogs) and never imports `electron`.
//
// Creator mounts through `creatorModuleMain` (`module.ts`, Phase 124 Theme E.3); `registerCreatorHandlers` stays for
// Creator's own app.
export { creatorMediaRoot, registerCreatorHandlers, registerCreatorOn, CREATOR_REPO_ID, type CreatorElectron } from './context';
export { createCreatorBridge, type CreatorBridge, type RendererIpc } from './bridge';
export { installCreatorFileProtocol, resolveCreatorFileUrl } from './file-protocol';
export { creatorModuleMain, type CreatorModuleServices } from './module';
