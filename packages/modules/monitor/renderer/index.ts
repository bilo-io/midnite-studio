// The Monitor module's renderer half: the monitor feature composed over the frame (Phase 124 Theme D).
// Never import an app, another module, `packages/app` or `electron`.
export { MonitorApp } from './monitor-app';
export { MonitorPane } from './monitor-pane';
export { MONITOR_NAV_GROUP, MONITOR_APP, type MonitorApp as MonitorAppManifest } from './monitor-manifest';
export { MonitorHome } from './views/monitor-home';
export { MONITOR_CHROME } from './compose/monitor-chrome';
export { monitorManifest } from '../manifest';
