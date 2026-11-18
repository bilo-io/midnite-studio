import type { ReactNode } from 'react';
import { useAuth } from './auth-context';
import { SignInScreen } from './sign-in-screen';

// Renders the sign-in screen until a session exists (Phase 146 E6). An `auth` result from any call signs out through
// `useAuth().signOut`, which lands here with the "session ended" notice.
export function AuthGate({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  if (state.status === 'loading') return null;
  if (state.status === 'signed-out') return <SignInScreen notice={state.notice} />;
  return <>{children}</>;
}
