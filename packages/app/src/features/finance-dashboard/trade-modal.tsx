import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { holdingQuantity, usdToCurrency, type MarketAsset, type MarketPortfolio } from '@midnite/studio-shared';

import { Modal } from '../../components/modal';
import { AssetIcon } from './asset-icon';
import { formatMoney, formatQuantity } from './finance-format';
import { Segmented } from './finance-parts';
import { usePortfolioOp, useRates } from './use-markets';

/**
 * Buy or sell the asset on the chart, against one of your cards.
 *
 * Simulated: nothing leaves the app. The price shown is the latest quote main
 * supplied, and main re-prices the trade itself when it is submitted — the
 * figure here is a preview, never an input — so a stale tab cannot trade at a
 * price from an hour ago.
 */
type Side = 'buy' | 'sell';

export function TradeModal({
  open,
  asset,
  priceUsd,
  portfolio,
  initialSide = 'buy',
  onClose,
}: {
  open: boolean;
  asset: MarketAsset;
  priceUsd: number | null;
  portfolio: MarketPortfolio;
  initialSide?: Side;
  onClose: () => void;
}) {
  const { apply } = usePortfolioOp();
  const { rates } = useRates();
  const [side, setSide] = useState<Side>(initialSide);
  const cards = useMemo(() => Object.keys(portfolio.balances), [portfolio.balances]);
  const [card, setCard] = useState(cards[0] ?? 'USD');
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const qtyId = useId();
  const cardId = useId();

  useEffect(() => {
    if (open) {
      setSide(initialSide);
      setRaw('');
      setError(null);
      setCard((current) => (cards.includes(current) ? current : (cards[0] ?? 'USD')));
    }
  }, [open, initialSide, cards]);

  const quantity = raw === '' ? 0 : Number(raw);
  const held = holdingQuantity(portfolio, asset.symbol);
  const balance = portfolio.balances[card] ?? 0;
  const cost = priceUsd === null ? null : Math.round(usdToCurrency(quantity * priceUsd, card, rates) * 100) / 100;
  const tooMuch = side === 'sell' ? quantity > held + 1e-9 : cost !== null && cost > balance + 1e-9;
  const valid = Number.isFinite(quantity) && quantity > 0 && priceUsd !== null && cost !== null && cost >= 0.01 && !tooMuch;

  const submit = async (): Promise<void> => {
    if (!valid || busy) return;
    setBusy(true);
    const outcome = await apply({ op: side, asset, quantity, currency: card });
    setBusy(false);
    if (outcome.ok) onClose();
    else setError(outcome.message);
  };

  return (
    <Modal open={open} onClose={onClose} size="sm" title={`Trade ${asset.symbol}`} initialFocusRef={inputRef}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <AssetIcon symbol={asset.symbol} size={32} />
          <div className="min-w-0 flex-1 leading-tight">
            <h2 className="truncate text-sm font-semibold">
              {asset.name} <span className="font-normal text-muted-foreground">{asset.symbol}</span>
            </h2>
            <p className="text-xs text-muted-foreground">
              {priceUsd === null ? 'No price available right now.' : `${formatMoney(priceUsd, 'USD')} each · you hold ${formatQuantity(held)}`}
            </p>
          </div>
          <Segmented<Side>
            label="Side"
            size="sm"
            value={side}
            onChange={(next) => {
              setSide(next);
              setError(null);
            }}
            options={[
              { id: 'buy', label: 'Buy' },
              { id: 'sell', label: 'Sell' },
            ]}
          />
        </div>

        <div className="flex flex-col gap-3 px-4 py-4">
          <div className="flex flex-col gap-1">
            <label htmlFor={cardId} className="text-xs font-medium text-muted-foreground">
              {side === 'buy' ? 'Pay with' : 'Receive into'}
            </label>
            <select
              id={cardId}
              value={card}
              onChange={(event) => {
                setCard(event.target.value);
                setError(null);
              }}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              {cards.map((code) => (
                <option key={code} value={code}>
                  {code} — {formatMoney(portfolio.balances[code] ?? 0, code)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={qtyId} className="text-xs font-medium text-muted-foreground">
              Quantity
            </label>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                id={qtyId}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={raw}
                placeholder="0"
                aria-invalid={tooMuch}
                onChange={(event) => {
                  setRaw(event.target.value);
                  setError(null);
                }}
                className={`min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-right text-base font-semibold tabular-nums outline-none focus:ring-2 focus:ring-ring ${
                  tooMuch ? 'border-destructive' : 'border-border'
                }`}
              />
              {side === 'sell' ? (
                <button
                  type="button"
                  onClick={() => setRaw(held > 0 ? String(held) : '')}
                  className="rounded-md border border-border px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  All
                </button>
              ) : null}
            </div>
          </div>

          <p role="status" className="min-h-[2.25rem] text-xs">
            {tooMuch ? (
              <span className="text-destructive">
                {side === 'sell'
                  ? `You hold only ${formatQuantity(held)} ${asset.symbol}.`
                  : `That costs ${formatMoney(cost ?? 0, card)} — more than the ${formatMoney(balance, card)} on this card.`}
              </span>
            ) : error ? (
              <span className="text-destructive">{error}</span>
            ) : valid && cost !== null ? (
              <span className="text-muted-foreground">
                {side === 'buy' ? 'Cost' : 'Proceeds'} <span className="tabular-nums text-foreground">{formatMoney(cost, card)}</span>
                {' · '}
                {side === 'buy' ? 'leaves' : 'brings the card to'}{' '}
                <span className="tabular-nums text-foreground">{formatMoney(side === 'buy' ? balance - cost : balance + cost, card)}</span>
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid || busy}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            {side === 'buy' ? 'Buy' : 'Sell'} {asset.symbol}
          </button>
        </div>
      </form>
    </Modal>
  );
}
