import { describe, expect, it, vi } from 'vitest';

import { isAppRunning } from './running';

describe('isAppRunning', () => {
  it('asks LaunchServices for the bundle id, never a process name', async () => {
    const run = vi.fn(async () => '');
    await isAppRunning('io.bilo.midnite-studio', run);
    expect(run).toHaveBeenCalledWith(['find', 'bundleid=io.bilo.midnite-studio']);
  });

  it('is running when LaunchServices names an app for it', async () => {
    expect(await isAppRunning('io.bilo.midnite-studio', async () => 'ASN:0x0-0xd00d-"Midnite_Studio":\n')).toBe(true);
  });

  // The case that blocked installs: Studio quit, its detached pty broker still alive under the same
  // process name. The broker is not a LaunchServices app, so `lsappinfo find` prints nothing.
  it('is not running when only a non-app process (the pty broker) is left', async () => {
    expect(await isAppRunning('io.bilo.midnite-studio', async () => '\n')).toBe(false);
  });

  it('is not running when lsappinfo could not run', async () => {
    expect(await isAppRunning('io.bilo.midnite-studio', async () => null)).toBe(false);
  });
});
