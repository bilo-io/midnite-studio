// Minimal, dependency-free extraction of a top-level YAML scalar — enough for
// verify-dist.mjs to read `version`/`path`/`sha512` out of electron-builder's
// generated `latest-mac.yml` without pulling in a real YAML parser for three
// fields. electron-builder's own output is simple enough for this: a flat
// `key: value` per line, values never spanning lines. Kept in its own module
// (rather than inline in verify-dist.mjs) purely so it can be unit-tested
// without also running that script's build-artifact side effects, which
// assume a real `moon run desktop:dist` has just produced a release/ dir.

/**
 * @param {string} yaml
 * @param {string} key
 * @returns {string | null}
 */
export function extractYamlScalar(yaml, key) {
  const match = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(yaml);
  return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : null;
}
