// The Cleaner module's renderer half: the cleaner feature composed over the frame (Phase 124 Theme D).
// Never import an app, another module, `packages/app` or `electron`.
export { CleanerApp } from './cleaner-app';
export { CLEANER_APP, type CleanerApp as CleanerAppManifest } from './cleaner-manifest';
export { CleanerHome } from './views/cleaner-home';
export { CLEANER_CHROME } from './compose/cleaner-chrome';
export { createCleanerHost, CLEANER_SETTINGS_KEY } from './compose/cleaner-host';
export { cleanerManifest } from '../manifest';
