// The Capture module's renderer half: the capture feature composed over the frame (Phase 124 Theme D).
// Never import an app, another module, `packages/app` or `electron`.
export { CaptureApp } from './capture-app';
export { CAPTURE_APP, type CaptureApp as CaptureAppManifest } from './capture-manifest';
export { CaptureHome } from './views/capture-home';
export { CAPTURE_CHROME } from './compose/capture-chrome';
export { captureManifest } from '../manifest';
