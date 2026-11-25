// Personal-access-token fallback (Phase 146 Theme E4): validate a pasted token with `viewer { login }` before it is
// saved, and report which of the scopes mobile needs it lacks. Classic tokens carry `X-OAuth-Scopes`; a fine-grained
// token has no such header, so its missing list is `null` (unknown) rather than "everything".
export const REQUIRED_SCOPES: { label: string; anyOf: string[] }[] = [
  { label: 'repo', anyOf: ['repo'] },
  { label: 'read:org', anyOf: ['read:org', 'write:org', 'admin:org'] },
  { label: 'read:project', anyOf: ['read:project', 'project'] },
];

export type PatValidation =
  | { ok: true; login: string; missingScopes: string[] | null }
  | { ok: false; kind: 'auth' | 'network' | 'error'; message: string };

export function missingScopes(header: string | null): string[] | null {
  if (header === null) return null;
  const granted = new Set(header.split(',').map((s) => s.trim()).filter(Boolean));
  return REQUIRED_SCOPES.filter((r) => !r.anyOf.some((s) => granted.has(s))).map((r) => r.label);
}

export async function validateToken(
  token: string,
  fetchImpl: (url: string, init: RequestInit) => Promise<Response> = (u, i) => fetch(u, i),
): Promise<PatValidation> {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, kind: 'error', message: 'Paste a token first' };
  try {
    const response = await fetchImpl('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${trimmed}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{viewer{login}}' }),
    });
    if (response.status === 401) return { ok: false, kind: 'auth', message: 'GitHub rejected that token' };
    if (!response.ok) return { ok: false, kind: 'error', message: `GitHub returned ${response.status}` };
    const body: unknown = await response.json();
    const login = (body as { data?: { viewer?: { login?: unknown } } } | null)?.data?.viewer?.login;
    if (typeof login !== 'string' || !login) return { ok: false, kind: 'error', message: 'GitHub returned an unexpected response' };
    return { ok: true, login, missingScopes: missingScopes(response.headers.get('X-OAuth-Scopes')) };
  } catch {
    return { ok: false, kind: 'network', message: 'Network request failed' };
  }
}
