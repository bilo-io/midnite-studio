import { describe, expect, it } from 'vitest';

import { readPlistString, stampPlist } from './plist-stamp';
import { PLIST } from './testing';

const base = PLIST('Midnite Apps', 'io.bilo.midnite-launcher');

describe('stampPlist', () => {
  it('replaces top-level strings in place and appends missing ones', () => {
    const out = stampPlist(base, { set: { CFBundleName: 'Midnite Cleaner', CFBundleIconFile: 'app.icns' } });
    expect(readPlistString(out, 'CFBundleName')).toBe('Midnite Cleaner');
    expect(readPlistString(out, 'CFBundleIconFile')).toBe('app.icns');
    // Untouched keys stay, in order.
    expect(readPlistString(out, 'CFBundleIdentifier')).toBe('io.bilo.midnite-launcher');
    expect(out.indexOf('CFBundleExecutable')).toBeLessThan(out.indexOf('CFBundleName'));
    expect(out.trimEnd().endsWith('</plist>')).toBe(true);
  });

  it('removes a key whose value is a nested dict or array, and nothing around it', () => {
    const out = stampPlist(base, { set: {}, remove: ['ElectronAsarIntegrity', 'CFBundleURLTypes'] });
    expect(out).not.toContain('ElectronAsarIntegrity');
    expect(out).not.toContain('Resources/app.asar');
    expect(out).not.toContain('CFBundleURLSchemes');
    expect(out).not.toContain('<string>midnite</string>');
    expect(readPlistString(out, 'NSPrincipalClass')).toBe('AtomApplication');
    expect(out).toContain('<key>LSUIElement</key>\n\t<false/>');
    // Still one well-formed root dict: as many closes as opens.
    expect(out.match(/<dict>/g)?.length).toBe(out.match(/<\/dict>/g)?.length);
  });

  it('touches only the root dict — a nested key of the same name is left alone', () => {
    const nested = base.replace('<key>CFBundleURLName</key>', '<key>CFBundleName</key>');
    const out = stampPlist(nested, { set: { CFBundleName: 'Midnite Cleaner' } });
    expect(out).toContain('<key>CFBundleName</key>\n\t\t\t<string>Midnite Apps</string>');
    expect(readPlistString(out, 'CFBundleName')).toBe('Midnite Cleaner');
  });

  it('escapes values and refuses a binary plist', () => {
    expect(readPlistString(stampPlist(base, { set: { CFBundleName: 'A & B' } }), 'CFBundleName')).toBe('A &amp; B');
    expect(() => stampPlist('bplist00\u0000…', { set: {} })).toThrow(/not an XML plist/);
  });
});
