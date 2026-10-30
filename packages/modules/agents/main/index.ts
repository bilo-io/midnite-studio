// The Agents module's main half (Phase 124 Theme E). Never imports `electron`: the host injects it.
export * from './bridge';
export * from './broker-sessions';
export * from './context';
export * from './node-session';
export * from './shell-runner';
export { agentsManifest } from '../manifest';
export * from './module';
