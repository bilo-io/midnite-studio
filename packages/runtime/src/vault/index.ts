/**
 * The runtime vault (Phase 113 Theme D) — see `vault-service.ts`. Main-only
 * and electron-free: the composer injects `safeStorage` as the cipher.
 */
export * from './secure-store';
export * from './vault-service';
export { createFakeCipher, startTestVaultHost, testPairingIdentity, type FakeCipher, type TestVaultHost } from './testing';

export * from './grants';
export * from './grants-handlers';
export * from './host';
export * from './unlock/passcode';
export * from './audit/vault-audit';
export * from './breach/hibp-check';
export * from './clipboard';
export * from './vault-clipboard-watch';
