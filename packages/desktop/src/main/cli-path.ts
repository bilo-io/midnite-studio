// The CLI's naming and target-path rules moved into the runtime (Phase 113
// Theme D), which owns the `midnite` command. Re-exported so desktop's call
// sites (and the tests that stub `preferredTargets` through this module) keep
// their import path.
export {
  aliasTargetFor,
  CLI_NAME,
  LEGACY_CLI_NAME,
  pathExportLine,
  preferredTargets,
  type CliCommandName,
  type CliInstallState,
} from '@midnite/studio-runtime';
