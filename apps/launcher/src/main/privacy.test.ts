import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { automaticAllowed, launcherPrivacyView, privacyFile, readLauncherSettings, writeLauncherSettings } from './privacy';

const dir = () => mkdtemp(join(tmpdir(), 'launcher-privacy-'));

describe('the launcher privacy switches', () => {
  it('default to on when there is no file, so today’s behaviour is unchanged', async () => {
    const file = privacyFile(await dir());
    expect(await automaticAllowed(file, 'launcher-updates')).toBe(true);
    expect(await automaticAllowed(file, 'launcher-catalog')).toBe(true);
    expect(launcherPrivacyView(await readLauncherSettings(file))).toEqual({
      allAutomaticOff: false,
      switches: { 'launcher-updates': true, 'launcher-catalog': true },
    });
  });

  it('each switch gates only its own call, and the file is owner-only', async () => {
    const file = privacyFile(await dir());
    await writeLauncherSettings(file, { allAutomaticOff: false, switches: { 'launcher-updates': false, 'launcher-catalog': true } });
    expect(await automaticAllowed(file, 'launcher-updates')).toBe(false);
    expect(await automaticAllowed(file, 'launcher-catalog')).toBe(true);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  it('the master overrides both without changing their stored values', async () => {
    const file = privacyFile(await dir());
    await writeLauncherSettings(file, { allAutomaticOff: true, switches: { 'launcher-updates': true, 'launcher-catalog': true } });
    expect(await automaticAllowed(file, 'launcher-updates')).toBe(false);
    expect(await automaticAllowed(file, 'launcher-catalog')).toBe(false);
    expect(launcherPrivacyView(await readLauncherSettings(file)).switches).toEqual({ 'launcher-updates': true, 'launcher-catalog': true });
    expect(JSON.parse(await readFile(file, 'utf8')).allAutomaticOff).toBe(true);
  });

  it('a corrupt file reads as the defaults', async () => {
    const file = privacyFile(await dir());
    await writeFile(file, '{not json');
    expect(await automaticAllowed(file, 'launcher-updates')).toBe(true);
  });
});
