'use strict';
// Decides "which identity signs this macOS bundle" for both afterpack hooks, the notarize path and
// the launcher dev stub. Mirrors electron-builder's own discovery, because that is what actually
// signs after afterPack. With no identity anywhere every caller falls back to today's ad-hoc `-`.
//
// Rule, in order:
//   1. CSC_IDENTITY_AUTO_DISCOVERY=false              -> adhoc (forced)
//   2. MIDNITE_CODESIGN_IDENTITY non-empty            -> developer-id, source 'env' (hooks sign with it themselves)
//   3. CSC_LINK or CSC_NAME non-empty                 -> developer-id, source 'builder' (electron-builder signs)
//   4. a "Developer ID Application: ..." in keychain  -> developer-id, source 'keychain' (builder discovers it)
//   5. otherwise                                      -> adhoc
const { execFileSync } = require('node:child_process');

const DEVELOPER_ID = /"(Developer ID Application: [^"]+)"/;

/** @returns {{kind:'developer-id', name:string, source:'env'|'builder'|'keychain'} | {kind:'adhoc'}} */
function resolveSigning(env, listIdentities) {
  if (env.CSC_IDENTITY_AUTO_DISCOVERY === 'false') return { kind: 'adhoc' };
  const own = (env.MIDNITE_CODESIGN_IDENTITY || '').trim();
  if (own) return { kind: 'developer-id', name: own, source: 'env' };
  if ((env.CSC_LINK || '').trim() || (env.CSC_NAME || '').trim()) {
    return { kind: 'developer-id', name: (env.CSC_NAME || '').trim() || 'from CSC_LINK', source: 'builder' };
  }
  let listing = '';
  try {
    listing = listIdentities ? String(listIdentities() || '') : '';
  } catch {
    listing = '';
  }
  for (const line of listing.split('\n')) {
    const match = DEVELOPER_ID.exec(line);
    if (match) return { kind: 'developer-id', name: match[1], source: 'keychain' };
  }
  return { kind: 'adhoc' };
}

/** Listing identities never prompts (using the key would). Any failure reads as "none". */
function listKeychainIdentities() {
  try {
    return execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

/**
 * What an afterPack hook should pass to `codesign --sign`, or null when electron-builder signs after
 * the hook and an ad-hoc pass would only be overwritten.
 */
function afterPackSignArg(resolved) {
  if (resolved.kind === 'adhoc') return '-';
  return resolved.source === 'env' ? resolved.name : null;
}

module.exports = { resolveSigning, listKeychainIdentities, afterPackSignArg };
