// The Startup module's main half (Phase 130). Never imports `electron`: the host injects it.
export * from './bridge';
export * from './module';
export * from './contract-dates';
export type { ContractFilePort } from './contract-files';
export * from './service';
export * from './workspace-store';
export { startupManifest } from '../manifest';
