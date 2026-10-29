// The Creator module's main half (Phase 124 Theme C). The window, identity and pairing stay with the host
// app; everything below is module logic that takes what it needs from the host (an `ipcMain`-shaped
// registrar, the media root, dialogs) and never imports `electron`.
//
// Creator registers through its own composer (`registerCreatorHandlers`, the app-composer pattern over the
// media features' mains); folding it into `mountModuleMains` is Theme E.3's wiring.
export { creatorMediaRoot, registerCreatorHandlers, CREATOR_REPO_ID, type CreatorElectron } from './context';
export { createCreatorBridge, type CreatorBridge, type RendererIpc } from './bridge';
export { installCreatorFileProtocol, resolveCreatorFileUrl } from './file-protocol';
