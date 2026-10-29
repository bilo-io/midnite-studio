// The Monitor module's main half (Phase 124 Theme D). Never imports `electron`: the host injects it.
export { createMonitorBridge, type MonitorBridge, type RendererIpc } from './bridge';
export { registerMonitorHandlers, type MonitorElectron } from './context';
export { monitorModuleMain, type MonitorModuleServices, type TerminalList } from './module';
export { createMonitorSessions, readHostSessions, terminalListFromShared, usageSessionsFrom } from './shared-sessions';
export { monitorManifest } from '../manifest';
