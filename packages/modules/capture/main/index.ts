// The Capture module's main half (Phase 124 Theme D). Never imports `electron`: the host injects it.
export { createCaptureBridge, type CaptureBridge, type RendererIpc } from './bridge';
export {
  captureDataDir,
  createCaptureAppService,
  registerCaptureAppHandlers,
  type CaptureAppElectron,
  type CaptureServiceElectron,
} from './context';
export { installCaptureFileProtocol, resolveCaptureAppFileUrl, type ProtocolElectron } from './file-protocol';
export { createOverlayBridge, overlayTokenFrom } from './overlay-bridge';
export { installCapturePermissions, isCaptureAppOrigin, type CapturePermissionSession } from './permissions';
export { CAPTURE_APP_SHORTCUT, captureModuleMain } from './module';
export { captureManifest } from '../manifest';
