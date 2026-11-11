// The Startup module's main half (Phase 130). Never imports `electron`: the host injects it.
export * from './bridge';
export * from './module';
export { startupManifest } from '../manifest';
