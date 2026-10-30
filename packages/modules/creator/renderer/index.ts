// The Creator module's renderer half: media-core's shell, the Docs, Images, Video and Audio tabs and
// the Slides deck, composed over the frame. Never imports an app, another module, `packages/app` or `electron`.
export { CreatorModule } from './creator-module';
export { CreatorHome } from './views/creator-home';
export { CreatorPane } from './creator-pane';
export { CREATOR_NAV_GROUP } from './creator-nav';
export { CREATOR_TABS } from './creator-tabs';
export { CREATOR_CHROME, CreatorDialogHost } from './compose/creator-chrome';
export { creatorManifest, CREATOR_REPO_ID, type CreatorManifest } from '../manifest';
