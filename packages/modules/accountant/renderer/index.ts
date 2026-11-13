// The Accountant module's renderer half: the ledger feature's workspace as a host pane and nav group.
// Never import an app, another module, `packages/app` or `electron`.
export { ACCOUNTANT_APP, ACCOUNTANT_VIEWS, type AccountantApp } from './accountant-manifest';
export { ACCOUNTANT_NAV_GROUP } from './accountant-nav';
export { AccountantPane, tabOfView } from './accountant-pane';
export { accountantManifest } from '../manifest';
