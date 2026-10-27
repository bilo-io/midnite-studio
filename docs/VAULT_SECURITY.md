# Vault Security & Threat Model

*Midnite Studio's architecture, threat model, key handling, and security positions for credentials and secrets.*

This document details the security posture of the suite's shared Vault service, implemented by `@midnite/studio-runtime` and consumed by Midnite Studio, the standalone Vault app (`apps/vault`), and paired suite applications.

---

## 1. Where the Key Is

The Vault relies on OS-backed hardware-bound encryption via Electron's `safeStorage`:

1. **OS Keychain:** On macOS, `safeStorage` derives an encryption key stored in the user's login keychain under the host process app credential (`"<App Name> Safe Storage"`).
2. **At-Rest Protection:** The login keychain itself is decrypted automatically when the user logs into macOS and is secured on disk by macOS FileVault (full-disk encryption).
3. **Runtime Encryption:** Stored entries on disk (`*.vault.json` under `userData`) are AES-256-GCM encrypted payloads produced by `safeStorage.encryptString`. The plaintext key is never exposed to JavaScript and never persisted directly to disk.

---

## 2. Who Holds Decrypt Capability

- **The Runtime Process:** Only the runtime host process (which executes Electron main and has access to `safeStorage`) holds the decrypt capability.
- **Paired Applications:** Secondary apps (`apps/vault`, `apps/browser`, etc.) run in separate processes and communicate with the runtime vault daemon via a local Unix socket (`vault.sock`).
- **Cryptographic Pairing:** Socket connections must complete an Ed25519 handshake against a dynamic nonce issued by the host. The guest signs the nonce using the private key generated during pairing (`pairing-store.ts`).
- **Grants:** A paired app is bounded strictly by its granted namespaces and key scopes (`vault-grants.json`). Even with a valid socket connection, an app can only read credentials explicitly granted to its `appId`.

---

## 3. What Pairing Proves (and What It Does Not)

Pairing verifies that the connecting socket peer holds the private Ed25519 key seed recorded in `pairing-store.ts` (stored with `0600` permissions under the user's application directory).

> **Crucial Distinction:** Pairing proves **App Identity**, not a **Trust Level**.
> A same-user process that gains arbitrary filesystem read privileges could read `pairing-store.ts`. Pairing ensures that rogue background processes cannot claim arbitrary app identities without possessing the stored seed, but it does not replace operating system user boundaries.

---

## 4. The Same-User Boundary: Before vs. After Phase 118

| Threat / Scenario | Before Phase 118 | After Phase 118 |
|---|---|---|
| **Vault Access on Idle** | Vault always open while user is logged in. Any paired app or socket client could read values indefinitely. | **Vault Lock:** Vault auto-locks after 15 min idle, system sleep, or screen lock. Read returns `locked` envelope. |
| **Audit Trail** | No record of which process read or rotated a secret. | **Tamper-Evident Audit Log:** Append-only `vault-audit.ndjson` with SHA-256 hash chaining logging every access, grant change, and refusal. |
| **Silent Grants Tampering** | `vault-grants.json` was plain JSON without integrity validation. | **Tamper Detection:** Hash-chain and integrity verification walks links and locks vault if tampering is detected. |
| **Breached Passwords** | No proactive warning if a stored database password or credential appeared in public breaches. | **k-Anonymity Breach Detection:** On-demand check against Have I Been Pwned Pwned Passwords range API sending only 5 hex characters. |

---

## 5. The Four Core Positions

1. **Same-User Compromise is the Documented Boundary:**
   Malware running arbitrary code in the user's desktop session with access to the user's login keychain can theoretically access decrypted safeStorage values. The Vault mitigates this by enforcing auto-locks, requiring fresh re-authentication for sensitive actions, and logging every operation.
2. **The Cipher Stays `safeStorage` (No Second Master Passphrase for Live Operations):**
   Live daily operations delegate to the platform keychain. We avoid custom crypto implementations or redundant passphrase prompts on every micro-operation. Export archives (Phase 118 Theme G) are the sole place where passphrase-derived scrypt/AES-256-GCM encryption is utilized.
3. **The Renderer Never Holds a Plaintext Secret:**
   Plaintext credentials never cross into renderer Zustand stores or browser local storage. Web view models receive only metadata (`hasToken: boolean`, key name, connection metadata). Any temporary reveal (Theme C) is a main-side, one-shot read rendered into a short-lived ephemeral ref, masked after 30 seconds.
4. **Nothing Rotates a Secret on the User's Behalf:**
   Breach detection and security scanning produce advisories with direct links to the relevant provider's settings. The application never autonomously changes passwords or revokes third-party tokens without explicit user direction.

---

## 6. Security Reviewer's Checklist

1. **Where are encryption keys generated and stored?**
   Inside macOS Login Keychain via `safeStorage` ([`secure-store.ts`](file:///Users/bilo-ekko/Dev/midnite/midnite-studio/packages/runtime/src/vault/secure-store.ts)).
2. **Can a compromised renderer process steal stored credentials?**
   No. Renderer IPC exposes only `has`, `keys`, `set`, and `delete`. There is no `secretsGet` channel in the renderer manifest ([`packages/features/vault/manifest.ts`](file:///Users/bilo-ekko/Dev/midnite/midnite-studio/packages/features/vault/manifest.ts)).
3. **What happens when the Mac goes to sleep or screensaver activates?**
   The vault service triggers `lock()`. Subsequent `read()` calls return `{ ok: false, kind: 'locked' }` ([`packages/runtime/src/vault/vault-service.ts`](file:///Users/bilo-ekko/Dev/midnite/midnite-studio/packages/runtime/src/vault/vault-service.ts)).
4. **How are apps authenticated over the local Unix socket?**
   Via Ed25519 signature verification of a cryptographically random challenge nonce generated on connect ([`packages/runtime/src/vault/host/server.ts`](file:///Users/bilo-ekko/Dev/midnite/midnite-studio/packages/runtime/src/vault/host/server.ts)).
5. **How are per-app permissions restricted?**
   Via `vault-grants.json` evaluated on every operation by `authorize()` ([`packages/runtime/src/vault/grants.ts`](file:///Users/bilo-ekko/Dev/midnite/midnite-studio/packages/runtime/src/vault/grants.ts)).
6. **How is the audit log protected against silent truncation or modification?**
   Using sequential SHA-256 hash chaining where each line commits to the hash of the preceding line ([`packages/runtime/src/vault/audit/vault-audit.ts`](file:///Users/bilo-ekko/Dev/midnite/midnite-studio/packages/runtime/src/vault/audit/vault-audit.ts)).
7. **Does breach checking leak credentials to third parties?**
   No. It utilizes the k-anonymity mathematical model: only the first 5 characters of the SHA-1 hash are sent over HTTPS with response padding enabled ([`packages/runtime/src/vault/breach/hibp-check.ts`](file:///Users/bilo-ekko/Dev/midnite/midnite-studio/packages/runtime/src/vault/breach/hibp-check.ts)).
8. **What file permissions are enforced for on-disk credentials?**
   `0600` (read/write by owner only) inside `0700` directories ([`packages/runtime/src/vault/secure-store.ts`](file:///Users/bilo-ekko/Dev/midnite/midnite-studio/packages/runtime/src/vault/secure-store.ts)).
9. **Can a rogue agent script silently inspect vault secrets?**
   No. Agent tools do not possess vault read grants. Agent runs operate within standard sandboxed runtime restrictions ([`packages/runtime/src/mcp/`](file:///Users/bilo-ekko/Dev/midnite/midnite-studio/packages/runtime/src/mcp/)).
10. **What is the recovery path if keychain access is corrupted?**
    Encrypted backup archives encrypted with user-selected passphrases using scrypt and AES-256-GCM ([Theme G](#7-encrypted-export-and-import-midnite-vault-export-v1)).

---

## 7. Encrypted Export and Import (midnite-vault-export-v1)

Theme G introduces portable, offline-recoverable encrypted backups:

### Envelope Specification
```json
{
  "v": 1,
  "kdf": {
    "name": "scrypt",
    "N": 131072,
    "r": 8,
    "p": 1,
    "maxmem": 268435456,
    "salt": "<32 hex chars (16 bytes)>"
  },
  "cipher": "aes-256-gcm",
  "iv": "<24 hex chars (12 bytes)>",
  "tag": "<32 hex chars (16 bytes)>",
  "ciphertext": "<hex string>"
}
```

- **Passphrase:** Minimum 12 characters, strength evaluated in UI.
- **KDF:** `scrypt` with `N = 131072` ($2^{17}$), `r = 8`, `p = 1`. Requires `128 * N * r = 128 MiB` RAM; `maxmem: 268435456` (256 MiB) is specified explicitly because standard Node.js `scrypt` defaults to 32 MiB.
- **Cipher:** `aes-256-gcm` with 96-bit random IV and 128-bit authentication tag. A wrong passphrase or modified ciphertext immediately fails GCM tag authentication.
- **Permissions:** Saved files are set to mode `0600`. Plaintext export is never permitted.

### Standalone Decrypt Script (Decryption without Midnite Studio)

Save as `decrypt-vault.mjs` and run: `node decrypt-vault.mjs <backup-file.json> <passphrase>`:

```javascript
import { createDecipheriv, scryptSync } from 'node:crypto';
import { readFileSync } from 'node:fs';

const envelope = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const passphrase = process.argv[3];
const key = scryptSync(passphrase, Buffer.from(envelope.kdf.salt, 'hex'), 32, {
  N: envelope.kdf.N,
  r: envelope.kdf.r,
  p: envelope.kdf.p,
  maxmem: envelope.kdf.maxmem,
});
const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'hex'));
decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
const decrypted = Buffer.concat([
  decipher.update(Buffer.from(envelope.ciphertext, 'hex')),
  decipher.final(),
]);
console.log(JSON.parse(decrypted.toString('utf8')));
```

### Restore Drill (Mac A to Mac B)
1. On **Mac A**: Unlock Vault (or authenticate within 60s), enter backup passphrase in Vault ▸ Encrypted Backup & Restore, click **Export Vault**, and save `midnite-vault-backup.json`.
2. Transfer `midnite-vault-backup.json` to **Mac B** (e.g. via USB drive or private transfer).
3. On **Mac B**: Open Vault ▸ Encrypted Backup & Restore, select `midnite-vault-backup.json`, enter passphrase, click **Preview Backup** to inspect entries without writing, and click **Apply Import** to restore credentials into Mac B's local keychain.

