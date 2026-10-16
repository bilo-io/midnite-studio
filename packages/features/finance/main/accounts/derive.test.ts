// @vitest-environment node
import type { Balance, Position } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { allocationByAccount, allocationByAsset, summarisePerformance, totalUsd } from './derive';

const pos = (symbol: string, marketValueUsd: number | null): Position => ({
  symbol,
  quantity: 1,
  marketValueUsd,
  costBasisUsd: null,
  unrealizedPnlUsd: null,
});
const bal = (currency: string, usd: number | null): Balance => ({ currency, total: 1, available: 1, usd });

describe('allocationByAsset', () => {
  it.each([
    {
      name: 'positions plus cash, largest first, weights sum to 1',
      balances: [bal('USD', 200)],
      positions: [pos('AAPL', 500), pos('TSLA', 300)],
      expected: [
        ['AAPL', 0.5],
        ['TSLA', 0.3],
        ['USD', 0.2],
      ],
    },
    {
      name: 'a crypto balance that is also a position is counted once',
      balances: [bal('BTC', 900), bal('USD', 100)],
      positions: [pos('BTC', 900)],
      expected: [
        ['BTC', 0.9],
        ['USD', 0.1],
      ],
    },
    {
      name: 'unpriced and short holdings have no slice',
      balances: [bal('EUR', null)],
      positions: [pos('GME', -100), pos('AAPL', 100), pos('XYZ', null)],
      expected: [['AAPL', 1]],
    },
    {
      name: 'slices under 2% fold into Other',
      balances: [],
      positions: [pos('A', 970), pos('B', 15), pos('C', 15)],
      expected: [
        ['A', 0.97],
        ['Other', 0.03],
      ],
    },
    { name: 'nothing held', balances: [], positions: [], expected: [] },
  ])('$name', ({ balances, positions, expected }) => {
    expect(allocationByAsset(balances, positions).map((s) => [s.label, s.weight])).toEqual(expected);
  });
});

describe('allocationByAccount', () => {
  it('weights each account by its total and drops empty ones', () => {
    const slices = allocationByAccount([
      { label: 'Kraken', totalUsd: 750 },
      { label: 'Alpaca', totalUsd: 250 },
      { label: 'Broken', totalUsd: 0 },
    ]);
    expect(slices.map((s) => [s.label, s.weight])).toEqual([
      ['Kraken', 0.75],
      ['Alpaca', 0.25],
    ]);
  });
});

describe('totalUsd', () => {
  it('sums priced positions and cash, ignoring unpriced lines', () => {
    expect(totalUsd([bal('USD', 100), bal('EUR', null), bal('BTC', 50)], [pos('BTC', 50), pos('X', null)])).toBe(150);
  });
});

describe('summarisePerformance', () => {
  it.each([
    { name: 'a gain', points: [{ t: 1, equityUsd: 100 }, { t: 2, equityUsd: 110 }], changeUsd: 10, changePct: 0.1 },
    { name: 'a loss, unsorted input', points: [{ t: 3, equityUsd: 50 }, { t: 1, equityUsd: 100 }], changeUsd: -50, changePct: -0.5 },
    { name: 'a zero start has no percentage', points: [{ t: 1, equityUsd: 0 }, { t: 2, equityUsd: 5 }], changeUsd: 5, changePct: null },
  ])('$name', ({ points, changeUsd, changePct }) => {
    expect(summarisePerformance(points)).toMatchObject({ changeUsd, changePct });
  });

  it('needs two points', () => {
    expect(summarisePerformance([])).toBeNull();
    expect(summarisePerformance([{ t: 1, equityUsd: 1 }])).toBeNull();
  });
});
