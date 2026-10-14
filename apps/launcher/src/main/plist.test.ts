import { describe, expect, it } from 'vitest';

import { bundleVersionFromPlist } from './plist';

describe('bundleVersionFromPlist', () => {
  it('reads CFBundleShortVersionString from an XML plist', () => {
    const plist = `<?xml version="1.0"?><plist><dict>
      <key>CFBundleName</key><string>Midnite Studio</string>
      <key>CFBundleShortVersionString</key>
      <string>0.4.1</string>
    </dict></plist>`;
    expect(bundleVersionFromPlist(plist)).toBe('0.4.1');
  });

  it('is null for a missing key or a binary plist', () => {
    expect(bundleVersionFromPlist('<plist><dict></dict></plist>')).toBeNull();
    expect(bundleVersionFromPlist('bplist00\u0000\u0001')).toBeNull();
  });
});
