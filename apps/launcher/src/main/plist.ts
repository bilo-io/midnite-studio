/**
 * Reads `CFBundleShortVersionString` out of an XML Info.plist. electron-builder
 * writes XML plists, so a regex over the text is enough — no plist parser, no
 * `plutil` subprocess. `null` for a binary plist or a missing key.
 */
export function bundleVersionFromPlist(text: string): string | null {
  const match = /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/.exec(text);
  return match?.[1]?.trim() || null;
}
