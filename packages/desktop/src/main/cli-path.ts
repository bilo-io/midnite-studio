import { join } from 'node:path';

export type CliInstallState = {
  installed: boolean;
  path: string | null;
  target: string | null;
  managed: boolean;
};

export function preferredTargets(home: string): string[] {
  return ['/usr/local/bin/midnite-studio', join(home, '.local/bin/midnite-studio')];
}

export function pathExportLine(dir: string): string {
  return `export PATH="${dir}:$PATH"`;
}
