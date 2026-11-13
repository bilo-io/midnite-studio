// The Health module's main half (Phase 128 Theme A). Never imports `electron`: the host injects it.
export * from './bridge';
export * from './context';
export * from './health-store';
export * from './module';
export { healthManifest } from '../manifest';
