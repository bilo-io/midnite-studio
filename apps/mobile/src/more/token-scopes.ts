// The scopes on the signed-in token (Phase 146 J4): GitHub reports them in the `X-OAuth-Scopes` header of any REST
// response, which the data source's `Result` does not carry, so this is one local `fetch` of `GET /user`. The token
// is read from the session ref and only ever lands in the Authorization header.
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/auth-context';

export type ScopesResult = { kind: 'scopes'; scopes: string[] } | { kind: 'none' };

/** Parse the header: a classic token lists its scopes, a fine-grained one sends none. */
export function parseScopes(header: string | null): ScopesResult {
  if (header === null) return { kind: 'none' };
  const scopes = header
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return scopes.length ? { kind: 'scopes', scopes } : { kind: 'none' };
}

export function useTokenScopes() {
  const auth = useAuth();
  const login = auth.state.status === 'signed-in' ? auth.state.login : null;
  return useQuery({
    queryKey: ['tokenScopes', login],
    enabled: login !== null,
    staleTime: Infinity,
    queryFn: async (): Promise<ScopesResult> => {
      const token = auth.getToken();
      if (!token) return { kind: 'none' };
      const res = await fetch('https://api.github.com/user', {
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` },
      });
      return parseScopes(res.headers.get('x-oauth-scopes'));
    },
  });
}
