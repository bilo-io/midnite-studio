// Token storage (Phase 146 Theme E5). The GitHub token lives in the OS keychain through expo-secure-store, keyed like
// desktop's forge vault, `${provider}:${host}:${login}`. The active login is the one non-secret value; it sits in the
// same store under a fixed key (no extra native module for one string).
//
// Rules this module keeps: the token is never logged, never put in a React Query key and never in an error message.
// There are deliberately no `console.*` calls in this file; `token-store.test.ts` greps the source to keep it so.
import * as SecureStore from 'expo-secure-store';

const PROVIDER = 'github';
const HOST = 'github.com';
/** The forge host the stored token is for (shown under the login in the forge panel). */
export const ACCOUNT_HOST = HOST;
const ACTIVE_LOGIN_KEY = 'midnite:active-login';

export const tokenKey = (login: string): string => `${PROVIDER}:${HOST}:${login}`;

export interface StoredSession {
  login: string;
  token: string;
}

/** Save the token for `login` and make it the active account. */
export async function saveSession(login: string, token: string): Promise<void> {
  await SecureStore.setItemAsync(tokenKey(login), token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  await SecureStore.setItemAsync(ACTIVE_LOGIN_KEY, login);
}

/** The active account's session, or `null` when signed out or the keychain read fails. */
export async function loadSession(): Promise<StoredSession | null> {
  try {
    const login = await SecureStore.getItemAsync(ACTIVE_LOGIN_KEY);
    if (!login) return null;
    const token = await SecureStore.getItemAsync(tokenKey(login));
    return token ? { login, token } : null;
  } catch {
    return null;
  }
}

/** Sign out: delete the active account's token and the active-login pref. */
export async function clearSession(): Promise<void> {
  try {
    const login = await SecureStore.getItemAsync(ACTIVE_LOGIN_KEY);
    if (login) await SecureStore.deleteItemAsync(tokenKey(login));
    await SecureStore.deleteItemAsync(ACTIVE_LOGIN_KEY);
  } catch {
    // A keychain that refuses a delete leaves nothing the caller can do; the in-memory session is dropped regardless.
  }
}
