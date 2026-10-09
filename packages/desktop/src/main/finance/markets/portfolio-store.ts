import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  MarketPortfolioSchema,
  applyPortfolioOp,
  seedPortfolio,
  type MarketAsset,
  type MarketPortfolio,
  type MarketPortfolioOp,
  type MarketRates,
} from '@midnite/studio-shared';

/**
 * The simulated portfolio, persisted as one JSON file under
 * `userData/finance/portfolio.json`.
 *
 * Main-side JSON rather than the renderer's persisted zustand store, for three
 * reasons. The transaction log only ever grows and does not belong in
 * `localStorage`'s quota; main must be the one to enforce "no overdrafts" and to
 * price a trade (the renderer is not trusted with either); and a file survives
 * a cleared browser profile. Writes are serialised through a promise chain and
 * land via temp-and-rename, so two quick deposits cannot interleave and a crash
 * cannot leave half a file. A missing or corrupt file seeds the starter
 * portfolio rather than failing the dashboard.
 */
export type PortfolioStoreOptions = {
  directory: string;
  now?: () => number;
  newId?: () => string;
  /** Units per USD; main's cached FX table. */
  getRates: () => Promise<MarketRates>;
  /** Current USD price, from the quote path — never from the renderer. */
  getPrice: (asset: MarketAsset) => Promise<number | undefined>;
};

export type PortfolioResult = { ok: true; value: MarketPortfolio } | { ok: false; message: string };

export function createPortfolioStore(options: PortfolioStoreOptions) {
  const now = options.now ?? Date.now;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const file = join(options.directory, 'portfolio.json');

  let current: MarketPortfolio | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  async function persist(portfolio: MarketPortfolio): Promise<void> {
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(portfolio, null, 2), 'utf8');
    await rename(tmp, file);
  }

  async function load(): Promise<MarketPortfolio> {
    if (current) return current;
    try {
      const parsed = MarketPortfolioSchema.safeParse(JSON.parse(await readFile(file, 'utf8')));
      if (parsed.success) {
        current = parsed.data;
        return current;
      }
    } catch {
      // missing or unreadable: fall through to the seed
    }
    current = seedPortfolio(now());
    await persist(current).catch(() => undefined);
    return current;
  }

  /** Run `task` after every earlier write has settled, whatever their outcome. */
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  }

  return {
    get: (): Promise<MarketPortfolio> => serial(load),

    apply: (op: MarketPortfolioOp): Promise<PortfolioResult> =>
      serial(async (): Promise<PortfolioResult> => {
        const portfolio = await load();
        const isTrade = op.op === 'buy' || op.op === 'sell';
        const needsRates = isTrade || op.op === 'deposit' || op.op === 'withdraw';
        const rates = needsRates ? await options.getRates() : { USD: 1 };
        const priceUsd = isTrade ? await options.getPrice(op.asset) : undefined;
        const outcome = applyPortfolioOp(portfolio, op, { now: now(), newId, rates, priceUsd });
        if (!outcome.ok) return { ok: false, message: outcome.message };
        await persist(outcome.portfolio);
        current = outcome.portfolio;
        return { ok: true, value: outcome.portfolio };
      }),
  };
}

export type PortfolioStore = ReturnType<typeof createPortfolioStore>;
