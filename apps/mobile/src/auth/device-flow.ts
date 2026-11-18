// GitHub OAuth device flow as a pure state machine (Phase 146 Theme E3). `fetch`, `sleep` and `now` are injected, so
// a test drives it with no real timers and no wall-clock. The UI shows `userCode` (copy via expo-clipboard), opens
// `verificationUri` in the system browser, and renders the state; this module touches neither.
//
//   idle -> awaiting-user -> polling -> done | expired | denied | error
//
// There is no client secret anywhere: the device flow needs only the public client id.
export const DEVICE_CODE_URL = 'https://github.com/login/device/code';
export const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
export const DEVICE_SCOPES = 'repo read:org read:project project';
const SLOW_DOWN_STEP_SECONDS = 5;
const GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';

export type DeviceFlowState =
  | { phase: 'idle' }
  | { phase: 'awaiting-user'; userCode: string; verificationUri: string; expiresAt: number }
  | { phase: 'polling'; userCode: string; verificationUri: string; expiresAt: number }
  | { phase: 'done'; token: string }
  | { phase: 'expired' }
  | { phase: 'denied' }
  | { phase: 'error'; message: string };

export interface DeviceFlowDeps {
  clientId: string;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  sleep: (ms: number) => Promise<void>;
  /** Milliseconds since the epoch. */
  now: () => number;
  onState?: (state: DeviceFlowState) => void;
  /** Checked before every poll; return true after the user cancels. */
  cancelled?: () => boolean;
}

async function post(deps: DeviceFlowDeps, url: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await deps.fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed: unknown = await response.json();
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Run the whole flow; resolves with the terminal state (`done`, `expired`, `denied` or `error`). Never throws. */
export async function runDeviceFlow(deps: DeviceFlowDeps): Promise<DeviceFlowState> {
  const emit = (state: DeviceFlowState): DeviceFlowState => {
    deps.onState?.(state);
    return state;
  };
  try {
    const code = await post(deps, DEVICE_CODE_URL, { client_id: deps.clientId, scope: DEVICE_SCOPES });
    const deviceCode = str(code['device_code']);
    const userCode = str(code['user_code']);
    const verificationUri = str(code['verification_uri']);
    if (!deviceCode || !userCode || !verificationUri) {
      return emit({ phase: 'error', message: str(code['error_description']) ?? 'GitHub did not start the sign-in' });
    }
    let intervalSeconds = num(code['interval']) ?? 5;
    const expiresAt = deps.now() + (num(code['expires_in']) ?? 900) * 1000;
    emit({ phase: 'awaiting-user', userCode, verificationUri, expiresAt });

    for (;;) {
      await deps.sleep(intervalSeconds * 1000);
      if (deps.cancelled?.()) return emit({ phase: 'error', message: 'Sign-in cancelled' });
      if (deps.now() >= expiresAt) return emit({ phase: 'expired' });
      emit({ phase: 'polling', userCode, verificationUri, expiresAt });
      const reply = await post(deps, ACCESS_TOKEN_URL, {
        client_id: deps.clientId,
        device_code: deviceCode,
        grant_type: GRANT_TYPE,
      });
      const token = str(reply['access_token']);
      if (token) return emit({ phase: 'done', token });
      switch (reply['error']) {
        case 'authorization_pending':
          break;
        case 'slow_down':
          intervalSeconds = (num(reply['interval']) ?? intervalSeconds) + SLOW_DOWN_STEP_SECONDS;
          break;
        case 'expired_token':
          return emit({ phase: 'expired' });
        case 'access_denied':
          return emit({ phase: 'denied' });
        default:
          return emit({ phase: 'error', message: str(reply['error_description']) ?? 'GitHub sign-in failed' });
      }
    }
  } catch {
    return emit({ phase: 'error', message: 'Network request failed' });
  }
}
