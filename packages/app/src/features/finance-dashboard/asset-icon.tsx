import type { CSSProperties } from 'react';

import { assetColor } from '@midnite/studio-shared';
import {
  SiApple,
  SiBinance,
  SiBitcoin,
  SiCardano,
  SiChainlink,
  SiCocacola,
  SiCoinbase,
  SiDogecoin,
  SiEthereum,
  SiGoogle,
  SiIntel,
  SiLitecoin,
  SiMeta,
  SiNetflix,
  SiNvidia,
  SiPolkadot,
  SiSolana,
  SiStellar,
  SiTesla,
  SiUber,
  SiVisa,
  SiXrp,
  SiAmd,
} from 'react-icons/si';

import type { IconComponent } from '../../components/icon-button';
import {
  AmazonMark,
  AvalancheMark,
  IndexFundMark,
  MicrosoftMark,
  TechFundMark,
} from '../../components/icons/market-marks';

/**
 * Official brand marks, by symbol: Simple Icons (CC0, via `react-icons/si`)
 * where it has the brand, and the app's own hand-drawn marks
 * (`components/icons/market-marks.tsx`) where it does not.
 */
const MARKS: Record<string, IconComponent> = {
  BTC: SiBitcoin,
  ETH: SiEthereum,
  SOL: SiSolana,
  XRP: SiXrp,
  BNB: SiBinance,
  DOGE: SiDogecoin,
  ADA: SiCardano,
  DOT: SiPolkadot,
  LINK: SiChainlink,
  LTC: SiLitecoin,
  XLM: SiStellar,
  AVAX: AvalancheMark,
  AAPL: SiApple,
  MSFT: MicrosoftMark,
  NVDA: SiNvidia,
  TSLA: SiTesla,
  GOOGL: SiGoogle,
  AMZN: AmazonMark,
  META: SiMeta,
  NFLX: SiNetflix,
  AMD: SiAmd,
  INTC: SiIntel,
  COIN: SiCoinbase,
  V: SiVisa,
  KO: SiCocacola,
  UBER: SiUber,
  SPY: IndexFundMark,
  QQQ: TechFundMark,
};

export const hasBrandMark = (symbol: string): boolean => symbol.toUpperCase() in MARKS;

/**
 * An asset's mark in its brand colour, on a soft tint of the same colour.
 *
 * An asset with no mark (a search hit like `ZZZZ`) gets its ticker's leading
 * letters in the same chip rather than a blank — so every row in every list is
 * recognisable at a glance and none looks broken.
 */
export function AssetIcon({
  symbol,
  size = 32,
  className = '',
}: {
  symbol: string;
  size?: number;
  className?: string;
}) {
  const color = assetColor(symbol);
  const Mark = MARKS[symbol.toUpperCase()];
  const chip: CSSProperties = {
    width: size,
    height: size,
    color,
    backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
  };
  return (
    <span
      aria-hidden
      data-asset-icon={symbol}
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${className}`}
      style={chip}
    >
      {Mark ? (
        <Mark className="" style={{ width: size * 0.56, height: size * 0.56 }} />
      ) : (
        <span className="font-semibold leading-none" style={{ fontSize: size * 0.34 }}>
          {symbol.slice(0, 3).toUpperCase()}
        </span>
      )}
    </span>
  );
}
