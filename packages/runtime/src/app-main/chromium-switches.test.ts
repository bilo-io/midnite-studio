// @vitest-environment node
// vitest: pure argv/switch logic, no Electron.
import { describe, expect, it, vi } from 'vitest';

import { assertSiteIsolation, findForbiddenChromiumSwitches } from './chromium-switches';

describe('findForbiddenChromiumSwitches', () => {
  it('is empty for a clean boot', () => {
    expect(findForbiddenChromiumSwitches(['/app/Electron', '.', '--inspect=0', '--remote-debugging-pipe'])).toEqual([]);
  });
  it('finds the sandbox, site-isolation and web-security switches on argv, with or without a value', () => {
    expect(
      findForbiddenChromiumSwitches(['electron', '--no-sandbox', '--disable-site-isolation-trials', '--disable-web-security=1']),
    ).toEqual(['--no-sandbox', '--disable-site-isolation-trials', '--disable-web-security']);
  });
  it('does not match a prefix of another switch', () => {
    expect(findForbiddenChromiumSwitches(['--no-sandbox-fake', '--disable-web-security-report'])).toEqual([]);
  });
  it('finds a switch appended programmatically through app.commandLine', () => {
    const hasSwitch = vi.fn((name: string) => name === 'no-sandbox');
    expect(findForbiddenChromiumSwitches(['electron'], hasSwitch)).toEqual(['--no-sandbox']);
  });
  it('finds site isolation turned off through --disable-features', () => {
    expect(findForbiddenChromiumSwitches(['--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process'])).toEqual([
      '--disable-features=IsolateOrigins',
      '--disable-features=site-per-process',
    ]);
  });
});

describe('assertSiteIsolation', () => {
  const log = { error: vi.fn() };
  it('throws in dev and test', () => {
    expect(() => assertSiteIsolation({ argv: ['--no-sandbox'], hasSwitch: () => false, isPackaged: false, log })).toThrow(
      /refusing --no-sandbox/,
    );
  });
  it('logs, and does not throw, in a packaged build', () => {
    log.error.mockClear();
    expect(assertSiteIsolation({ argv: ['--disable-web-security'], hasSwitch: () => false, isPackaged: true, log })).toEqual([
      '--disable-web-security',
    ]);
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('--disable-web-security'));
  });
  it('is silent on a clean boot', () => {
    log.error.mockClear();
    expect(assertSiteIsolation({ argv: ['electron', '.'], hasSwitch: () => false, isPackaged: false, log })).toEqual([]);
    expect(log.error).not.toHaveBeenCalled();
  });
});
