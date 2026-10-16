import type { AccountConnectorId, AccountConnectorInfo } from '@midnite/studio-shared';

import { alpacaConnector } from './alpaca';
import type { AccountConnector } from './connector';
import { krakenConnector } from './kraken';

/**
 * Every connector, by id. Adding one is: a new file implementing `AccountConnector`,
 * its id in `ACCOUNT_CONNECTOR_IDS` (shared), one line here, and a recorded-fixture test.
 */
export const CONNECTORS: Readonly<Record<AccountConnectorId, AccountConnector>> = {
  alpaca: alpacaConnector,
  kraken: krakenConnector,
};

export const connectorFor = (id: AccountConnectorId): AccountConnector => CONNECTORS[id];

/** The connectors' public faces — names and field labels, nothing about the endpoints or any value. */
export function connectorInfos(): AccountConnectorInfo[] {
  return Object.values(CONNECTORS).map((c) => ({
    id: c.id,
    label: c.label,
    assetClass: c.assetClass,
    inputs: c.fields,
    supportsEnvironment: c.supportsEnvironment,
    readOnlyHint: c.readOnlyHint,
  }));
}
