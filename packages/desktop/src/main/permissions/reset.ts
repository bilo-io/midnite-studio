import { execFile } from 'node:child_process';

import { failure, ok, type GitOpResult, type MacPermissionId } from '@midnite/studio-shared';

import { TCC_SERVICES } from './probe';

export type ExecFilePort = (
  file: string,
  args: string[],
  cb: (err: (Error & { code?: number | string }) | null, stdout: string, stderr: string) => void,
) => void;

const defaultExec: ExecFilePort = (file, args, cb) => {
  execFile(file, args, { timeout: 10_000 }, (err, stdout, stderr) => cb(err, String(stdout), String(stderr)));
};

/**
 * `tccutil reset <Service> <bundle id>` for this app only, one service at a time. Never `sudo`: a service
 * that needs admin comes back as the error envelope with tccutil's own stderr, and nothing throws.
 */
export async function resetPermission(
  id: MacPermissionId,
  bundleId: string,
  exec: ExecFilePort = defaultExec,
  platform: NodeJS.Platform = process.platform,
): Promise<GitOpResult> {
  if (platform !== 'darwin') return failure('Permissions can only be reset on macOS.');
  const services = TCC_SERVICES[id];
  if (!services) return failure('This permission is not managed by the privacy database; nothing to reset.');
  for (const service of services) {
    const err = await new Promise<string | null>((resolve) => {
      try {
        exec('/usr/bin/tccutil', ['reset', service, bundleId], (e, _out, stderr) =>
          resolve(e ? stderr.trim() || e.message : null),
        );
      } catch (thrown) {
        resolve(String(thrown));
      }
    });
    if (err !== null) return failure(`tccutil reset ${service} failed: ${err}`, err);
  }
  return ok();
}
