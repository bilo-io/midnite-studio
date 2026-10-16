/**
 * The finance feature's renderer half (Phase 113 Theme P). Needs the frame
 * (bridge, chrome port) and its own {@link FinanceHost} for the pieces of
 * chrome that sit on app state (modal, popover, tooltip, links).
 *
 * Finance has no view of its own: it is dashboard widgets, a status-bar
 * segment and the lock-screen's quote — each composing app places them.
 * `sideEffects: false` keeps an app that imports one widget from pulling the
 * rest into its entry chunk.
 */
export { financeManifest, type FinanceManifest } from '../manifest';
export {
  FinanceHostProvider,
  useFinanceHost,
  type FinanceEmptyStateProps,
  type FinanceHost,
  type FinanceLinkEvent,
  type FinanceModalProps,
  type FinancePopoverProps,
  type FinanceTooltipProps,
} from './host';

// Status bar, panel and the lock screen's quote.
export { FinancePanel } from './finance/finance-panel';
export { FinanceSegment } from './finance/finance-segment';
export { assetTicker, fmtPct, fmtPrice, historyChange } from './finance/finance-derive';
export { useFinanceHistory, useFinanceQuote } from './finance/finance-queries';
export { Sparkline } from './finance/sparkline';
export { FINANCE_PERSIST_KEY, FINANCE_WATCHLIST_MAX, useFinanceStore } from './finance/finance-store';

// Dashboard widgets.
export { AllocationWidget } from './dashboard/allocation-widget';
export { AssetListWidget } from './dashboard/asset-list-widget';
export { AssetStackWidget } from './dashboard/asset-stack-widget';
export { BankCardsWidget } from './dashboard/bank-cards-widget';
export { BigChartWidget } from './dashboard/big-chart-widget';
export { FinanceHeaderControls } from './dashboard/finance-header-controls';
export { NewsWidget } from './dashboard/news-widget';
export { TransactionsWidget } from './dashboard/transactions-widget';
