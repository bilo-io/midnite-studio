import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderView } from '../../../test-support/render';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { DEFAULT_TABS, FINANCE_DASHBOARD_ID, useDashboardStore } from '../../store/dashboard-store';
import { DashboardView } from '../dashboard/dashboard-view';
import { DEFAULT_NEWS, useFinanceUiStore } from './finance-ui-store';

/**
 * The Finance dashboard, assembled through the mock bridge — jsdom, vitest.
 *
 * Why not Playwright: nothing here needs a real browser. Layout is not under
 * test (the grid's resize is the library's own and the framework's existing
 * behaviour), the chart canvas is stubbed (`lightweight-charts` needs a real
 * canvas and has its own test suite), and no pointer drag is involved. Every
 * price on screen comes from the mock bridge's seeded generator — there is no
 * network anywhere in this file.
 */
vi.mock('./price-chart', () => ({
  default: ({ type, candles, up }: { type: string; candles: unknown[]; up: boolean }) => (
    <div data-testid="price-chart-stub" data-type={type} data-points={candles.length} data-up={String(up)} />
  ),
}));

const opened = vi.hoisted(() => ({ calls: [] as { url: string; target: unknown }[] }));
vi.mock('../../services/open-in-midnite', () => ({
  openInMidnite: (url: string, options: { target?: unknown } = {}) => opened.calls.push({ url, target: options.target }),
  openLinkFromEvent: (url: string) => opened.calls.push({ url, target: 'preference' }),
}));

const NEWS = [
  { title: 'Bitcoin climbs past a new high', link: 'https://news.example/btc', source: 'Wire', origin: 'BTC', publishedAt: 1_799_999_000_000 },
  { title: 'Apple unveils new chip', link: 'https://news.example/aapl', source: 'Tech Daily', origin: 'AAPL', publishedAt: 1_799_998_000_000 },
];

/** The bridge's unrelated required fixtures, left empty — nothing here touches a repository. */
const baseFixtures = (markets: MockFixtures['markets'] = {}): MockFixtures => ({
  commitDetails: {},
  revisions: {},
  diffs: {},
  graphRows: [],
  statusEntries: [],
  markets: { news: NEWS, ...markets },
});

const open = (overrides: { markets?: MockFixtures['markets'] } = {}) => {
  useDashboardStore.setState({ boards: {}, tabs: DEFAULT_TABS, activeId: FINANCE_DASHBOARD_ID });
  return renderView(<DashboardView />, { fixtures: baseFixtures(overrides.markets), uiState: { selectedRepoId: 'repo-1' } });
};

const card = (name: string) => screen.findByRole('region', { name });

beforeEach(() => {
  opened.calls.length = 0;
  useFinanceUiStore.setState({
    currency: 'USD',
    timescale: '1M',
    chartAsset: null,
    chartType: 'candles',
    sorts: { watchlist: { key: 'name', dir: 'asc' }, markets: { key: 'name', dir: 'asc' } },
    news: DEFAULT_NEWS,
    refreshNonce: 0,
  });
});
afterEach(cleanup);

describe('the Finance board', () => {
  it('is the third default dashboard and seeds all eight cards', async () => {
    open();
    for (const name of ['Bank cards', 'Assets', 'Allocation', 'Chart', 'Watchlist', 'Markets', 'Transactions', 'Market news']) {
      expect(await card(name)).toBeTruthy();
    }
    expect(screen.getByRole('tab', { name: /^Finance/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('puts the global timescale and currency in the dashboard header, not in a card', async () => {
    open();
    await card('Chart');
    const controls = screen.getByTestId('finance-controls');
    expect(within(controls).getByRole('radiogroup', { name: 'Timescale' })).toBeTruthy();
    expect(within(controls).getByRole('combobox', { name: 'Display currency' })).toBeTruthy();
    for (const name of ['Bank cards', 'Assets', 'Chart', 'Watchlist']) {
      expect(within(screen.getByRole('region', { name })).queryByRole('radiogroup', { name: 'Timescale' })).toBeNull();
    }
    expect(within(controls).getAllByRole('radio').map((r) => r.textContent)).toEqual(['1D', '1W', '1M', '3M', '1Y', '5Y', 'ALL']);
  });

  it('shows no repository controls on a board with no repository cards', async () => {
    open();
    await card('Chart');
    expect(screen.queryByRole('combobox', { name: 'Statistics window' })).toBeNull();
  });
});

describe('timescale', () => {
  it('one pick drives every card: chart window, list sparklines and the summary wording', async () => {
    open();
    const chart = await card('Chart');
    await within(chart).findByTestId('summary-headline');
    expect(within(chart).getByTestId('summary-headline').textContent).toContain('past month');

    fireEvent.click(within(screen.getByTestId('finance-controls')).getByRole('radio', { name: '1Y' }));

    expect(useFinanceUiStore.getState().timescale).toBe('1Y');
    await waitFor(() => expect(within(chart).getByTestId('summary-headline').textContent).toContain('past year'));
    const watchlist = screen.getByRole('region', { name: 'Watchlist' });
    await waitFor(() => expect(within(watchlist).getAllByRole('img', { name: /over the past year/ }).length).toBeGreaterThan(0));
  });
});

describe('bank cards', () => {
  it('shows one masked card per currency with its balance', async () => {
    open();
    const cards = await card('Bank cards');
    for (const code of ['USD', 'EUR', 'ZAR']) {
      const el = await within(cards).findByLabelText(`${code} card`);
      expect(el.textContent).toMatch(/•••• \d{4}/);
      expect(el.textContent).toContain(code);
    }
    expect(within(cards).getByLabelText('USD card').textContent).toMatch(/1,000\.00/);
  });

  it('fans out on click and collapses again', async () => {
    open();
    const group = await within(await card('Bank cards')).findByRole('group', { name: 'bank cards' });
    expect(group.getAttribute('data-expanded')).toBe('false');
    fireEvent.click(group);
    expect(group.getAttribute('data-expanded')).toBe('true');
    fireEvent.click(group);
    expect(group.getAttribute('data-expanded')).toBe('false');
  });

  it('deposits through a modal with a stepper, and logs the transaction', async () => {
    const user = userEvent.setup();
    open();
    const cards = await card('Bank cards');
    await user.click(await within(cards).findByRole('button', { name: 'Deposit into USD card' }));

    const dialog = await screen.findByRole('dialog', { name: 'Deposit USD' });
    const input = within(dialog).getByLabelText(/Amount/);
    await user.click(within(dialog).getByRole('button', { name: 'Increase by 10' }));
    await user.click(within(dialog).getByRole('button', { name: 'Increase by 10' }));
    expect((input as HTMLInputElement).value).toBe('20');
    await user.click(within(dialog).getByRole('button', { name: '+100' }));
    expect((input as HTMLInputElement).value).toBe('120');
    expect(within(dialog).getByRole('status').textContent).toMatch(/New balance.*1,120\.00/);

    await user.click(within(dialog).getByRole('button', { name: 'Deposit' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Deposit USD' })).toBeNull());
    await waitFor(() => expect(within(cards).getByLabelText('USD card').textContent).toMatch(/1,120\.00/));
    const ledger = await card('Transactions');
    await within(ledger).findByText('Deposit');
  });

  it('never lets a withdrawal go below zero', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await within(await card('Bank cards')).findByRole('button', { name: 'Withdraw from USD card' }));
    const dialog = await screen.findByRole('dialog', { name: 'Withdraw USD' });
    const submit = within(dialog).getByRole('button', { name: 'Withdraw' });

    await user.type(within(dialog).getByLabelText(/Amount/), '1000.01');
    expect(submit.hasAttribute('disabled')).toBe(true);
    expect(within(dialog).getByRole('status').textContent).toMatch(/more than the .*1,000\.00 on this card/);

    await user.clear(within(dialog).getByLabelText(/Amount/));
    await user.click(within(dialog).getByRole('button', { name: 'Max' }));
    expect(submit.hasAttribute('disabled')).toBe(false);
    await user.click(submit);

    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Bank cards' })).getByLabelText('USD card').textContent).toMatch(/\$0\.00/));
    // …and with nothing left, the card offers no more withdrawals.
    expect(within(screen.getByRole('region', { name: 'Bank cards' })).getByRole('button', { name: 'Withdraw from USD card' }).hasAttribute('disabled')).toBe(true);
  });

  it('adds a card for a new currency', async () => {
    const user = userEvent.setup();
    open();
    const cards = await card('Bank cards');
    await user.click(await within(cards).findByRole('button', { name: 'Add card' }));
    await user.selectOptions(within(cards).getByLabelText('Currency for the new card'), 'GBP');
    expect(await within(cards).findByLabelText('GBP card')).toBeTruthy();
  });
});

describe('asset cards', () => {
  it('shows a card per holding with price, gain or loss and a toned sparkline', async () => {
    open();
    const stack = await card('Assets');
    const btc = await within(stack).findByLabelText('Bitcoin card');
    expect(btc.textContent).toContain('BTC');
    expect(btc.textContent).toMatch(/0\.5 held/);
    const tone = btc.querySelector('[data-tone]')?.getAttribute('data-tone');
    expect(['up', 'down']).toContain(tone);
    // The arrow, the text and the sparkline share one tone.
    const tones = new Set([...btc.querySelectorAll('[data-tone]')].map((n) => n.getAttribute('data-tone')));
    expect(tones.size).toBe(1);
    expect(within(stack).getByLabelText('Apple card')).toBeTruthy();
  });

  it('degrades to an explanation, not a crash, when the provider is down', async () => {
    open({ markets: { down: true } });
    const stack = await card('Assets');
    expect((await within(stack).findByRole('alert')).textContent).toMatch(/Market data is unavailable/);
  });
});

describe('allocation', () => {
  it('draws a donut with a legend and the total', async () => {
    open();
    const alloc = await card('Allocation');
    const total = await within(alloc).findByTestId('allocation-total');
    expect(total.textContent).toMatch(/\$/);
    const legend = within(alloc).getByRole('list', { name: 'Allocation legend' });
    await within(legend).findByText('Bitcoin');
    expect(within(legend).getByText('Apple')).toBeTruthy();
    expect(within(legend).getByText('Cash')).toBeTruthy();
    expect(alloc.querySelectorAll('[data-slice]').length).toBe(3);
  });

  it('can leave cash out', async () => {
    open();
    const alloc = await card('Allocation');
    await within(alloc).findByText('Cash');
    fireEvent.click(within(alloc).getByLabelText('Include cash'));
    expect(within(alloc).queryByText('Cash')).toBeNull();
  });
});

describe('currency', () => {
  it('re-denominates prices and balances through the rate table', async () => {
    open();
    const alloc = await card('Allocation');
    const usd = (await within(alloc).findByTestId('allocation-total')).textContent;

    fireEvent.change(screen.getByRole('combobox', { name: 'Display currency' }), { target: { value: 'ZAR' } });

    await waitFor(() => expect(within(alloc).getByTestId('allocation-total').textContent).not.toBe(usd));
    expect(within(alloc).getByTestId('allocation-total').textContent).toMatch(/R/);
    // The USD card now shows its balance converted into rand.
    expect(within(screen.getByRole('region', { name: 'Bank cards' })).getByLabelText('USD card').textContent).toMatch(/≈ .*R/);
  });
});

describe('watchlist and markets', () => {
  it('splits known assets between the two cards', async () => {
    open();
    const watchlist = await card('Watchlist');
    const markets = await card('Markets');
    const rows = (el: HTMLElement) => [...el.querySelectorAll('[data-row]')].map((r) => r.getAttribute('data-row'));
    await waitFor(() => expect(rows(watchlist)).toEqual(expect.arrayContaining(['BTC', 'ETH', 'AAPL'])));
    expect(rows(watchlist)).toHaveLength(3);
    expect(rows(markets)).toEqual(expect.arrayContaining(['SOL', 'MSFT', 'NVDA', 'TSLA', 'SPY']));
    expect(rows(markets)).not.toContain('BTC');
  });

  it('moves a row between the cards when starred and unstarred', async () => {
    const user = userEvent.setup();
    open();
    const watchlist = await card('Watchlist');
    const markets = await card('Markets');
    await within(markets).findByText('Solana');
    await user.click(within(markets).getByRole('button', { name: 'Watch Solana' }));
    await waitFor(() => expect(watchlist.querySelector('[data-row="SOL"]')).toBeTruthy());
    expect(markets.querySelector('[data-row="SOL"]')).toBeNull();

    await user.click(within(watchlist).getByRole('button', { name: 'Unwatch Solana' }));
    await waitFor(() => expect(markets.querySelector('[data-row="SOL"]')).toBeTruthy());
  });

  it('sorts by name, price and percentage gain, flipping on a second click', async () => {
    const user = userEvent.setup();
    open();
    const watchlist = await card('Watchlist');
    const order = () => [...watchlist.querySelectorAll('[data-row]')].map((r) => r.getAttribute('data-row'));
    await waitFor(() => expect(order()).toHaveLength(3));
    expect(order()).toEqual(['AAPL', 'BTC', 'ETH']); // by name: Apple, Bitcoin, Ethereum

    await user.click(within(watchlist).getByRole('button', { name: /Sort by Name/ }));
    expect(order()).toEqual(['ETH', 'BTC', 'AAPL']);

    await user.click(within(watchlist).getByRole('button', { name: /Sort by Price/ }));
    expect(order()).toEqual(['BTC', 'ETH', 'AAPL']); // 60,000 > 3,000 > 200, descending first

    await user.click(within(watchlist).getByRole('button', { name: /Sort by Gain \/ loss %/ }));
    const byPct = order();
    expect([...byPct].sort()).toEqual(['AAPL', 'BTC', 'ETH']);
    expect(useFinanceUiStore.getState().sorts.watchlist).toEqual({ key: 'gainPct', dir: 'desc' });
  });

  it('offers value and absolute gain as sort keys too', async () => {
    open();
    const watchlist = await card('Watchlist');
    await within(watchlist).findByRole('button', { name: /Sort by Name/ });
    for (const key of ['name', 'price', 'value', 'gain', 'gainPct']) {
      expect(watchlist.querySelector(`[data-sort="${key}"]`)).toBeTruthy();
    }
  });

  it('selects an asset on the chart when its row is clicked', async () => {
    const user = userEvent.setup();
    open();
    const markets = await card('Markets');
    await user.click(await within(markets).findByRole('button', { name: 'Show Tesla on the chart' }));
    expect(useFinanceUiStore.getState().chartAsset).toEqual({ symbol: 'TSLA', name: 'Tesla', kind: 'stock' });
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Chart' })).getByRole('heading', { name: /Tesla/ })).toBeTruthy());
  });
});

describe('the big chart', () => {
  it('lazy-loads the chart and shows the summary for the window', async () => {
    open();
    const chart = await card('Chart');
    expect(await within(chart).findByTestId('price-chart-stub')).toBeTruthy();
    expect(within(chart).getByTestId('summary-headline').textContent).toMatch(/^(Up|Down|Flat)/);
    expect(within(chart).getByRole('region', { name: 'Summary' }).querySelectorAll('[data-summary]').length).toBeGreaterThan(3);
  });

  it('offers candlestick, line, area, % change and OHLC bars', async () => {
    const user = userEvent.setup();
    open();
    const chart = await card('Chart');
    const stub = await within(chart).findByTestId('price-chart-stub');
    const group = within(chart).getByRole('radiogroup', { name: 'Chart type' });
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Candles', 'Line', 'Area', '% change', 'OHLC']);
    for (const [label, type] of [['Line', 'line'], ['Area', 'area'], ['% change', 'percent'], ['OHLC', 'bars'], ['Candles', 'candles']] as const) {
      await user.click(within(group).getByRole('radio', { name: label }));
      expect(stub.getAttribute('data-type')).toBe(type);
    }
  });

  it('searches with autocomplete across stocks and crypto', async () => {
    const user = userEvent.setup();
    open();
    const chart = await card('Chart');
    const box = within(chart).getByRole('combobox', { name: 'Search stocks and crypto' });
    await user.click(box);
    // Empty: the watchlist and holdings are offered.
    expect(await screen.findByRole('listbox', { name: 'Suggestions' })).toBeTruthy();
    await user.type(box, 'sol');
    const list = await screen.findByRole('listbox', { name: 'Search results' });
    await within(list).findByRole('option', { name: /SOL.*Solana/ });
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');
    expect(useFinanceUiStore.getState().chartAsset?.symbol).toBe('SOL');
    await waitFor(() => expect(within(chart).getByRole('heading', { name: /Solana/ })).toBeTruthy());
  });

  it('expands Insights into the fuller breakdown', async () => {
    const user = userEvent.setup();
    open();
    const chart = await card('Chart');
    await within(chart).findByTestId('summary-headline');
    const button = within(chart).getByRole('button', { name: 'Insights' });
    expect(button.className).toContain('rainbow-btn');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(within(chart).queryByRole('region', { name: 'Insights' })).toBeNull();

    await user.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const panel = within(chart).getByRole('region', { name: 'Insights' });
    expect(panel.querySelectorAll('[data-summary]').length).toBeGreaterThan(
      within(chart).getByRole('region', { name: 'Summary' }).querySelectorAll('[data-summary]').length,
    );
    expect(panel.textContent).toMatch(/not a forecast, and no AI/);
  });

  it('credits TradingView', async () => {
    open();
    const chart = await card('Chart');
    expect(within(chart).getByRole('link', { name: /TradingView Lightweight Charts/ }).getAttribute('href')).toBe('https://www.tradingview.com/');
  });

  it('buys through the trade modal, debiting the card and logging a buy', async () => {
    const user = userEvent.setup();
    open();
    const chart = await card('Chart');
    await within(chart).findByTestId('price-chart-stub');
    await user.click(within(chart).getByRole('button', { name: 'Trade' }));
    const dialog = await screen.findByRole('dialog', { name: /Trade/ });
    await user.type(within(dialog).getByLabelText('Quantity'), '0.001');
    await user.click(within(dialog).getByRole('button', { name: /^Buy / }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Trade/ })).toBeNull());
    const ledger = await card('Transactions');
    await within(ledger).findByText('Buy');
  });

  it('shows an error with Retry when there is no data', async () => {
    open({ markets: { down: true } });
    const chart = await card('Chart');
    expect(await within(chart).findByText('No chart data')).toBeTruthy();
    expect(within(chart).getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(within(chart).queryByTestId('price-chart-stub')).toBeNull();
  });
});

describe('transactions', () => {
  const trade = async (user: ReturnType<typeof userEvent.setup>) => {
    const cards = await card('Bank cards');
    await user.click(await within(cards).findByRole('button', { name: 'Deposit into EUR card' }));
    const dialog = await screen.findByRole('dialog', { name: 'Deposit EUR' });
    await user.type(within(dialog).getByLabelText(/Amount/), '250');
    await user.click(within(dialog).getByRole('button', { name: 'Deposit' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Deposit EUR' })).toBeNull());
  };

  it('starts empty and then lists what you do, newest first', async () => {
    const user = userEvent.setup();
    open();
    const ledger = await card('Transactions');
    expect(await within(ledger).findByText('No transactions yet')).toBeTruthy();
    await trade(user);
    await trade(user);
    await waitFor(() => expect(ledger.querySelectorAll('tbody tr')).toHaveLength(2));
    expect(within(ledger).getAllByText('Deposit')).toHaveLength(2);
  });

  it('searches and sorts', async () => {
    const user = userEvent.setup();
    open();
    await trade(user);
    const ledger = await card('Transactions');
    await within(ledger).findByText('Deposit');

    await user.type(within(ledger).getByRole('searchbox'), 'nothing-matches');
    expect(await within(ledger).findByText(/No transactions match/)).toBeTruthy();
    await user.clear(within(ledger).getByRole('searchbox'));
    await user.type(within(ledger).getByRole('searchbox'), 'eur');
    expect(ledger.querySelectorAll('tbody tr')).toHaveLength(1);

    const dateHeader = within(ledger).getByRole('columnheader', { name: /Date/ });
    expect(dateHeader.getAttribute('aria-sort')).toBe('descending');
    await user.click(within(dateHeader).getByRole('button'));
    expect(dateHeader.getAttribute('aria-sort')).toBe('ascending');
  });
});

describe('market news', () => {
  it('lists headlines with their source', async () => {
    open();
    const news = await card('Market news');
    const list = await within(news).findByRole('list', { name: 'Market headlines' });
    expect(within(list).getByText('Bitcoin climbs past a new high')).toBeTruthy();
    expect(within(list).getByText(/Tech Daily/)).toBeTruthy();
  });

  it('offers the Midnite browser and the system browser for every item', async () => {
    const user = userEvent.setup();
    open();
    const news = await card('Market news');
    const row = (await within(news).findByText('Apple unveils new chip')).closest('li') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Open in Midnite browser' }));
    await user.click(within(row).getByRole('button', { name: 'Open in system browser' }));
    expect(opened.calls).toEqual([
      { url: 'https://news.example/aapl', target: 'in-app' },
      { url: 'https://news.example/aapl', target: 'system' },
    ]);
    await user.click(within(row).getByRole('link', { name: 'Apple unveils new chip' }));
    expect(opened.calls.at(-1)).toEqual({ url: 'https://news.example/aapl', target: 'preference' });
  });

  it('edits feeds and keywords from the settings popover', async () => {
    const user = userEvent.setup();
    open();
    const news = await card('Market news');
    await user.click(within(news).getByRole('button', { name: 'News settings' }));
    const panel = await screen.findByRole('dialog', {}, { timeout: 1000 }).catch(() => document.body);

    const keywords = within(panel).getByRole('region', { name: 'Keywords' });
    await user.type(within(keywords).getByLabelText('Keyword'), 'interest rates{enter}');
    expect(useFinanceUiStore.getState().news.keywords).toEqual(['interest rates']);

    const feeds = within(panel).getByRole('region', { name: 'Feeds' });
    await user.type(within(feeds).getByLabelText('Feed address'), 'not a url{enter}');
    expect(within(feeds).getByRole('alert').textContent).toMatch(/http\(s\) feed/);
    await user.clear(within(feeds).getByLabelText('Feed address'));
    await user.type(within(feeds).getByLabelText('Feed address'), 'https://example.org/feed.xml{enter}');
    expect(useFinanceUiStore.getState().news.feeds.map((f) => f.url)).toContain('https://example.org/feed.xml');

    await user.click(within(feeds).getByRole('button', { name: 'Remove Cointelegraph' }));
    expect(useFinanceUiStore.getState().news.feeds.map((f) => f.id)).not.toContain('cointelegraph');
  });
});
