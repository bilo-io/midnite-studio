import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { DEFAULT_MONEY_CURRENCY, seedFleetCatalog, type FleetCatalog } from '@midnite/studio-shared';

export type ProjectionsMoney = { currency: string; catalog: FleetCatalog };

const DEFAULT_MONEY: ProjectionsMoney = { currency: DEFAULT_MONEY_CURRENCY, catalog: seedFleetCatalog(DEFAULT_MONEY_CURRENCY) };
const MoneyContext = createContext<ProjectionsMoney>(DEFAULT_MONEY);

/** The company currency and the workspace catalog, threaded from `ProjectionsView` to every formatter and the model. */
export function MoneyProvider({ currency, catalog, children }: ProjectionsMoney & { children: ReactNode }) {
  const value = useMemo(() => ({ currency, catalog }), [currency, catalog]);
  return <MoneyContext.Provider value={value}>{children}</MoneyContext.Provider>;
}

export const useMoney = (): ProjectionsMoney => useContext(MoneyContext);
