import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAuth } from '../auth/auth-context';
import { GitHubDataSource } from './github-source';
import type { MobileDataSource } from './source';

const SourceContext = createContext<MobileDataSource | null>(null);

/** Provides the app's `MobileDataSource`: GitHub direct unless a `source` is passed in. */
export function DataSourceProvider({ children, source }: { children: ReactNode; source?: MobileDataSource | undefined }) {
  const { getToken } = useAuth();
  const value = useMemo(() => source ?? new GitHubDataSource({ getToken }), [source, getToken]);
  return <SourceContext.Provider value={value}>{children}</SourceContext.Provider>;
}

export function useDataSource(): MobileDataSource {
  const source = useContext(SourceContext);
  if (!source) throw new Error('useDataSource must be used inside <DataSourceProvider>');
  return source;
}
