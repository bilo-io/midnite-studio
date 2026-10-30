// The Coder module's renderer half: the feature host ports and views composed over the frame.
// Never imports an app, another module, `packages/app` or `electron`.
export { CoderModule } from './coder-module';
export { CoderPane } from './coder-pane';
export { CODER_NAV_GROUP } from './coder-nav';
export { CoderHome } from './views/coder-home';
export { coderStore, useCoderStore, type CoderState } from './coder-store';
export { CODER_CHROME, CoderDialogHost, dialogStore } from './compose/coder-chrome';
export { CODER_FORGE_HOST, CODER_TESTS_HOST } from './compose/coder-hosts';
export { coderTasksStore } from './compose/tasks-store';
export { coderManifest, CODER_VIEWS, CODER_HOME, type CoderViewId, type CoderManifest } from '../manifest';
