import { describe, expect, it } from 'vitest';

import { resetPermission, type ExecFilePort } from './reset';

const BUNDLE = 'io.bilo.midnite-studio';

describe('resetPermission', () => {
  it('runs tccutil reset for the bundle id and returns ok', async () => {
    const calls: string[][] = [];
    const exec: ExecFilePort = (file, args, cb) => {
      calls.push([file, ...args]);
      cb(null, '', '');
    };
    expect(await resetPermission('screen', BUNDLE, exec, 'darwin')).toEqual({ ok: true });
    expect(calls).toEqual([['/usr/bin/tccutil', 'reset', 'ScreenCapture', BUNDLE]]);
  });

  it('resets every Files & Folders service, never a bare `All`', async () => {
    const services: string[] = [];
    await resetPermission('files', BUNDLE, (_f, a, cb) => (services.push(a[1]!), cb(null, '', '')), 'darwin');
    expect(services.length).toBeGreaterThan(1);
    expect(services).not.toContain('All');
  });

  it('turns a non-zero exit into the error envelope with stderr, without throwing', async () => {
    const exec: ExecFilePort = (_f, _a, cb) => cb(Object.assign(new Error('exit 1'), { code: 1 }), '', 'tccutil: Failed to reset\n');
    const r = await resetPermission('fullDisk', BUNDLE, exec, 'darwin');
    expect(r).toMatchObject({ ok: false, kind: 'error', stderr: 'tccutil: Failed to reset' });
  });

  it('turns a synchronous spawn throw into the envelope too', async () => {
    const exec: ExecFilePort = () => {
      throw new Error('ENOENT');
    };
    expect(await resetPermission('camera', BUNDLE, exec, 'darwin')).toMatchObject({ ok: false, kind: 'error' });
  });

  it('refuses off macOS and for rows with no TCC service', async () => {
    const exec: ExecFilePort = () => {
      throw new Error('must not run');
    };
    expect(await resetPermission('screen', BUNDLE, exec, 'linux')).toMatchObject({ ok: false });
    expect(await resetPermission('notifications', BUNDLE, exec, 'darwin')).toMatchObject({ ok: false });
  });
});
