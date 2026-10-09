import { useMemo, useState } from 'react';

import { LuCreditCard, LuMinus, LuNfc, LuPlus } from 'react-icons/lu';

import { MARKET_CURRENCIES, cardLastFour, marketCurrency, usdToCurrency } from '@midnite/studio-shared';

import { EmptyState } from '../../components/empty-state';
import { Skeleton } from '../../components/skeleton';
import { AmountModal, type AmountMode } from './amount-modal';
import { FanStack } from './fan-stack';
import { formatMoney, maskedCard } from './finance-format';
import { useDisplayCurrency, usePortfolio, usePortfolioOp } from './use-markets';

/**
 * One simulated card per fiat currency, stacked like a wallet.
 *
 * Every card is a real balance held in main's portfolio: **+** deposits and
 * **−** withdraws through the same `markets.apply` channel, each opening a
 * modal with a number picker. A withdrawal cannot take the card below zero —
 * the modal blocks it as you type and main refuses it regardless — and every
 * change lands in the transaction log.
 */
const CARD_HEIGHT = 128;

/** A stable hue per currency, so USD is always the same blue and ZAR always the same green. */
const hueFor = (currency: string): number => {
  let hash = 0;
  for (const ch of currency) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
};

type Card = { currency: string; balance: number };

export function BankCardsWidget() {
  const { data: portfolio, isLoading, error } = usePortfolio();
  const { apply } = usePortfolioOp();
  const { currency: display, rates, ratesLoaded } = useDisplayCurrency();
  const [dialog, setDialog] = useState<{ mode: AmountMode; currency: string } | null>(null);
  const [adding, setAdding] = useState(false);

  const cards: Card[] = useMemo(
    () =>
      Object.entries(portfolio?.balances ?? {})
        .map(([currency, balance]) => ({ currency, balance }))
        // The display currency leads, then the biggest balance in USD terms — the front card is the one you care about.
        .sort(
          (a, b) =>
            Number(b.currency === display) - Number(a.currency === display) ||
            b.balance / (rates[b.currency] ?? 1) - a.balance / (rates[a.currency] ?? 1),
        ),
    [portfolio?.balances, display, rates],
  );

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (error || !portfolio) {
    return (
      <EmptyState
        icon={LuCreditCard}
        title="Wallet unavailable"
        body={error instanceof Error ? error.message : 'The simulated portfolio could not be read.'}
      />
    );
  }

  const open = dialog ? cards.find((c) => c.currency === dialog.currency) : undefined;
  const heldCurrencies = new Set(cards.map((c) => c.currency));
  const available = MARKET_CURRENCIES.filter((c) => !heldCurrencies.has(c.code));

  return (
    <div className="flex flex-col gap-2">
      <FanStack
        label="bank cards"
        items={cards}
        keyOf={(card) => card.currency}
        cardHeight={CARD_HEIGHT}
        renderCard={(card) => (
          <BankCard
            card={card}
            display={display}
            showConversion={ratesLoaded}
            usdRate={usdToCurrency(1, display, rates) / (rates[card.currency] ?? 1)}
            onDeposit={() => setDialog({ mode: 'deposit', currency: card.currency })}
            onWithdraw={() => setDialog({ mode: 'withdraw', currency: card.currency })}
          />
        )}
      />

      {adding ? (
        <div className="flex items-center gap-2">
          <select
            aria-label="Currency for the new card"
            defaultValue=""
            onChange={(event) => {
              if (!event.target.value) return;
              void apply({ op: 'addCard', currency: event.target.value });
              setAdding(false);
            }}
            className="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-1 text-xs"
          >
            <option value="" disabled>
              Choose a currency…
            </option>
            {available.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setAdding(false)} className="text-xs text-muted-foreground hover:text-foreground">
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={available.length === 0}
          onClick={() => setAdding(true)}
          className="flex items-center justify-center gap-1 self-start rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-40"
        >
          <LuPlus aria-hidden className="size-3" />
          Add card
        </button>
      )}

      {dialog && open ? (
        <AmountModal
          open
          mode={dialog.mode}
          currency={open.currency}
          balance={open.balance}
          onClose={() => setDialog(null)}
          onSubmit={async (amount) => {
            const outcome = await apply({ op: dialog.mode, currency: open.currency, amount });
            return outcome.ok ? null : outcome.message;
          }}
        />
      ) : null}
    </div>
  );
}

function BankCard({
  card,
  display,
  showConversion,
  usdRate,
  onDeposit,
  onWithdraw,
}: {
  card: Card;
  display: string;
  showConversion: boolean;
  /** Units of the display currency per one unit of this card's currency. */
  usdRate: number;
  onDeposit: () => void;
  onWithdraw: () => void;
}) {
  const hue = hueFor(card.currency);
  const meta = marketCurrency(card.currency);
  const converted = card.currency !== display && showConversion;
  return (
    <article
      aria-label={`${card.currency} card`}
      data-card={card.currency}
      className="relative flex h-full cursor-pointer select-none flex-col justify-between overflow-hidden rounded-xl p-3 text-white shadow-md ring-1 ring-black/10"
      style={{
        backgroundImage: `linear-gradient(135deg, hsl(${hue} 62% 40%), hsl(${(hue + 42) % 360} 68% 26%))`,
      }}
    >
      {/* soft highlight, so each card reads as glossy plastic rather than a flat fill */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-white/10 blur-xl"
      />
      <header className="relative flex items-start justify-between">
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-wide">{card.currency}</p>
          <p className="text-[10px] uppercase tracking-wider text-white/70">{meta.name}</p>
        </div>
        <LuNfc aria-hidden className="size-5 rotate-90 text-white/70" />
      </header>

      <div className="relative flex items-center gap-2">
        <span aria-hidden className="h-5 w-7 rounded-[4px] bg-gradient-to-br from-amber-200 to-amber-500/80 ring-1 ring-black/20" />
        <span className="font-mono text-xs tracking-[0.22em] text-white/85">{maskedCard(cardLastFour(card.currency))}</span>
      </div>

      <footer className="relative flex items-end justify-between gap-2">
        <div className="min-w-0 leading-tight">
          <p className="truncate text-xl font-semibold tabular-nums">{formatMoney(card.balance, card.currency)}</p>
          {converted ? (
            <p className="truncate text-[11px] tabular-nums text-white/70">≈ {formatMoney(card.balance * usdRate, display)}</p>
          ) : null}
        </div>
        <div data-no-toggle className="flex shrink-0 items-center gap-1.5">
          <CardButton label={`Withdraw from ${card.currency} card`} onClick={onWithdraw} disabled={card.balance <= 0}>
            <LuMinus aria-hidden className="size-4" />
          </CardButton>
          <CardButton label={`Deposit into ${card.currency} card`} onClick={onDeposit}>
            <LuPlus aria-hidden className="size-4" />
          </CardButton>
        </div>
      </footer>
    </article>
  );
}

function CardButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/35 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
