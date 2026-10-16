/**
 * The runtime vault (Phase 113 Theme D) — see `vault-service.ts`. Main-only
 * and electron-free: the composer injects `safeStorage` as the cipher.
 */
export * from './secure-store';
export * from './vault-service';
export { createFakeCipher, type FakeCipher } from './testing';

export * from './grants';
export * from './grants-handlers';
