import { dirname, join } from 'node:path';

export type CliInstallState = {
  installed: boolean;
  path: string | null;
  target: string | null;
  managed: boolean;
  version?: string | null;
  onPath?: boolean;
  pathExportLine?: string | null;
  command?: CliCommandName;
  aliasInstalled?: boolean;
  notice?: string | null;
};

/** The CLI's command name. */
export const CLI_NAME = 'midnite';
/**
 * The pre-rename command. Kept as a deprecated alias for one release (it is
 * removed in the release after the one that ships this rename) so existing
 * muscle memory, scripts and docs keep working while people move to `midnite`.
 */
export const LEGACY_CLI_NAME = 'midnite-studio';

export type CliCommandName = typeof CLI_NAME | typeof LEGACY_CLI_NAME;

/** Where the primary `midnite` command is linked, in order of preference. */
export function preferredTargets(home: string): string[] {
  return [`/usr/local/bin/${CLI_NAME}`, join(home, `.local/bin/${CLI_NAME}`)];
}

/** The deprecated `midnite-studio` alias path that sits beside a primary target. */
export function aliasTargetFor(target: string): string {
  return join(dirname(target), LEGACY_CLI_NAME);
}

export function pathExportLine(dir: string): string {
  return `export PATH="${dir}:$PATH"`;
}
