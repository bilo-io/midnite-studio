// The Startup module's main half (Phase 130). Never imports `electron`: the host injects it.
export * from './bridge';
export * from './module';
export type { ContractFilePort } from './contract-files';
export type { CsvPort } from './fleet-export-ops';
export type { InvoicePdfPort } from './invoice-pdf';
export type { MailPorts, SaveMarkdownPort } from './investor-update-export';
export type { StartupBookAccount, StartupLedgerPort, StartupPostSource } from './ledger-port';
export * from './service';
export * from './workspace-store';
export { startupManifest } from '../manifest';
export * from './mcp';
export { openAgentConsent, type AgentConsentStore } from './agent-consent';
export { openAiSettings, type AiSettingsStore } from './ai-settings';
export * from './investor-update';
