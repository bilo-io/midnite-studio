import type { ReactNode } from 'react';

// TODO(Phase 146 E6): replace this passthrough with the real gate (restore the GitHub session from
// expo-secure-store, redirect to sign-in when there is none).
export function AuthGate({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
