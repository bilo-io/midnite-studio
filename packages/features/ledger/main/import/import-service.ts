import { createHash, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';

import {
  parseAmount,
  type ImportCommitResult,
  type ImportCommitRow,
  type ImportMapping,
  type ImportPick,
  type ImportPreview,
  type ImportPreviewRow,
  type ImportRule,
  type LedgerBook,
  type LedgerErrorKind,
  type LedgerResult,
  type SuiteAppId,
} from '@midnite/studio-shared';

import type { LedgerService } from '../ledger-service';
import { CSV_MAX_BYTES, CSV_MAX_ROWS, parseCsv } from './csv';

const fail = (kind: LedgerErrorKind, message: string): { ok: false; kind: LedgerErrorKind; message: string } => ({ ok: false, kind, message });
const SAMPLE_ROWS = 10;

export type ImportServiceOptions = {
  service: LedgerService;
  appId: SuiteAppId;
  pickCsv: () => Promise<string | null>;
};

export type ImportService = {
  pick(bookId: string): Promise<LedgerResult<ImportPick | null>>;
  preview(bookId: string, mapping: ImportMapping): Promise<LedgerResult<ImportPreview>>;
  commit(bookId: string, mapping: ImportMapping, rows: ImportCommitRow[]): Promise<LedgerResult<ImportCommitResult>>;
};

/** A statement date in one of the three supported layouts, as `YYYY-MM-DD`; null when it is not a real calendar date. */
export function parseStatementDate(text: string, format: ImportMapping['date']['format']): string | null {
  const t = text.trim();
  let y: number;
  let m: number;
  let d: number;
  if (format === 'YYYY-MM-DD') {
    const hit = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
    if (!hit) return null;
    [y, m, d] = [Number(hit[1]), Number(hit[2]), Number(hit[3])] as [number, number, number];
  } else {
    const hit = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
    if (!hit) return null;
    const [a, b, year] = [Number(hit[1]), Number(hit[2]), Number(hit[3])] as [number, number, number];
    [y, m, d] = format === 'DD/MM/YYYY' ? [year, b, a] : [year, a, b];
  }
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Strips currency marks and spaces, reads `(1.50)` as negative, and turns a decimal comma into a point. */
function normaliseAmountText(raw: string): string {
  let t = raw.replace(/[\s £$€¥]/g, '');
  let negative = false;
  if (/^\(.*\)$/.test(t)) {
    negative = true;
    t = t.slice(1, -1);
  }
  if (t.endsWith('-')) {
    negative = !negative;
    t = t.slice(0, -1);
  }
  if (t.startsWith('+')) t = t.slice(1);
  if (t.startsWith('-')) {
    negative = !negative;
    t = t.slice(1);
  }
  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  if (lastComma > lastDot && /,\d{1,2}$/.test(t)) t = `${t.slice(0, lastComma).replace(/[.,]/g, '')}.${t.slice(lastComma + 1)}`;
  return negative ? `-${t}` : t;
}

/** An amount cell as signed minor units, or an error message. An empty cell is `null`. */
function cellMinor(raw: string | undefined, currency: string): { minor: number | null } | { error: string } {
  if (raw === undefined || raw.trim() === '') return { minor: null };
  const parsed = parseAmount(normaliseAmountText(raw), currency);
  if (parsed.ok) return { minor: parsed.minor };
  const reasons = { 'not-a-number': 'is not a number', 'too-many-decimals': 'has more decimals than the currency allows', 'too-large': 'is too large', empty: 'is empty' } as const;
  return { error: `Amount "${raw.trim()}" ${reasons[parsed.reason]}.` };
}

type ParsedRow = { index: number; date: string; description: string; minor: number } | { index: number; error: string; date: string; description: string };

/** Reads every data row (the first row is the header) through the mapping. */
function readRows(rows: readonly string[][], mapping: ImportMapping, currency: string): ParsedRow[] {
  return rows.slice(1).map((cells, index): ParsedRow => {
    const description = (cells[mapping.description] ?? '').trim();
    const rawDate = cells[mapping.date.column] ?? '';
    const date = parseStatementDate(rawDate, mapping.date.format);
    const base = { index, date: date ?? '', description: description.slice(0, 200) };
    if (!date) return { ...base, error: `Date "${rawDate.trim()}" is not ${mapping.date.format}.` };
    if (description === '') return { ...base, error: 'The description is empty.' };
    let minor: number;
    if (mapping.amount.kind === 'single') {
      const cell = cellMinor(cells[mapping.amount.column], currency);
      if ('error' in cell) return { ...base, error: cell.error };
      if (cell.minor === null) return { ...base, error: 'The amount is empty.' };
      minor = mapping.amount.negativeIsOutflow ? cell.minor : -cell.minor;
    } else {
      const inflow = cellMinor(cells[mapping.amount.inColumn], currency);
      const outflow = cellMinor(cells[mapping.amount.outColumn], currency);
      if ('error' in inflow) return { ...base, error: inflow.error };
      if ('error' in outflow) return { ...base, error: outflow.error };
      if (inflow.minor === null && outflow.minor === null) return { ...base, error: 'The amount is empty.' };
      minor = Math.abs(inflow.minor ?? 0) - Math.abs(outflow.minor ?? 0);
    }
    if (minor === 0) return { ...base, error: 'The amount is zero.' };
    return { ...base, minor };
  });
}

/** First matching rule by ascending priority whose account still exists and is not archived. */
export function suggestAccount(book: LedgerBook, description: string): string | null {
  const text = description.toLowerCase();
  const rules: ImportRule[] = [...book.rules].sort((a, b) => a.priority - b.priority);
  for (const rule of rules) {
    if (!text.includes(rule.match.contains.toLowerCase())) continue;
    if (book.accounts.some((a) => a.id === rule.accountId && !a.archived)) return rule.accountId;
  }
  return null;
}

/**
 * Idempotency reference: the same statement row always hashes the same, and `n` counts identical rows earlier in
 * the file so two genuine identical payments both post while a re-import posts neither again.
 */
export const importRef = (bankAccountId: string, date: string, minor: number, description: string, n: number): string =>
  createHash('sha256').update(`${bankAccountId}|${date}|${minor}|${description}|${n}`).digest('hex');

function refsFor(rows: readonly ParsedRow[], bankAccountId: string): Map<number, string> {
  const seen = new Map<string, number>();
  const refs = new Map<number, string>();
  for (const row of rows) {
    if ('error' in row) continue;
    const key = `${row.date}|${row.minor}|${row.description}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    refs.set(row.index, importRef(bankAccountId, row.date, row.minor, row.description, n));
  }
  return refs;
}

/** The import ops: pick (the path stays here behind a token), preview, and commit. */
export function createImportService(opts: ImportServiceOptions): ImportService {
  const { service, appId } = opts;
  /** The picked statement, by token. Replaced on every pick, so a token expires on the next one. */
  const statements = new Map<string, string[][]>();

  async function context(bookId: string, mapping: ImportMapping) {
    const rows = statements.get(mapping.token);
    if (!rows) return fail('invalid', 'That statement is no longer open. Choose the file again.');
    const snap = await service.snapshot(bookId);
    if (!snap.ok) return snap;
    const { book, entries, readOnly } = snap.value;
    const bank = book.accounts.find((a) => a.id === mapping.bankAccountId);
    if (!bank || bank.archived) return fail('invalid', 'Choose an open bank account for this statement.');
    const width = rows[0]?.length ?? 0;
    for (const col of [mapping.date.column, mapping.description, ...(mapping.amount.kind === 'single' ? [mapping.amount.column] : [mapping.amount.inColumn, mapping.amount.outColumn])]) {
      if (col >= width) return fail('invalid', 'A mapped column is not in the statement.');
    }
    const parsed = readRows(rows, mapping, book.currency);
    const known = new Set<string>();
    for (const e of entries) if (e.source.kind === 'import' && e.source.ref) known.add(e.source.ref);
    return { ok: true as const, book, bank, parsed, refs: refsFor(parsed, mapping.bankAccountId), known, readOnly };
  }

  return {
    async pick(bookId) {
      const book = await service.getBook(bookId);
      if (!book.ok) return book;
      const path = await opts.pickCsv();
      if (path === null) return { ok: true, value: null };
      const size = (await stat(path)).size;
      if (size > CSV_MAX_BYTES) return fail('invalid', 'Statement is larger than 5 MB.');
      const { rows } = parseCsv(await readFile(path, 'utf8'));
      if (rows.length > CSV_MAX_ROWS) return fail('invalid', `Statement is larger than ${CSV_MAX_ROWS.toLocaleString('en-US')} rows.`);
      if (rows.length < 2) return fail('invalid', 'That file has no statement rows.');
      statements.clear();
      const token = randomUUID();
      statements.set(token, rows);
      return { ok: true, value: { token, header: rows[0] as string[], sample: rows.slice(1, 1 + SAMPLE_ROWS) } };
    },

    async preview(bookId, mapping) {
      const ctx = await context(bookId, mapping);
      if (!('book' in ctx)) return ctx;
      const out: ImportPreviewRow[] = ctx.parsed.map((row): ImportPreviewRow => {
        if ('error' in row) return { index: row.index, date: row.date, description: row.description, minor: 0, suggestedAccountId: null, duplicate: false, error: row.error };
        const ref = ctx.refs.get(row.index) as string;
        return { index: row.index, date: row.date, description: row.description, minor: row.minor, suggestedAccountId: suggestAccount(ctx.book, row.description), duplicate: ctx.known.has(ref) };
      });
      return { ok: true, value: { rows: out } };
    },

    async commit(bookId, mapping, picked) {
      const ctx = await context(bookId, mapping);
      if (!('book' in ctx)) return ctx;
      if (ctx.readOnly) return fail('read-only', 'This book is open for writing in another window.');
      const byIndex = new Map(ctx.parsed.map((r) => [r.index, r]));
      const result: ImportCommitResult = { posted: 0, duplicates: 0, failed: [] };
      const remember: { contains: string; accountId: string }[] = [];
      const done = new Set<number>();
      for (const pick of picked) {
        const row = byIndex.get(pick.index);
        if (!row || done.has(pick.index)) {
          result.failed.push({ index: pick.index, reason: row ? 'The row was listed twice.' : 'That row is not in the statement.' });
          continue;
        }
        done.add(pick.index);
        if ('error' in row) {
          result.failed.push({ index: pick.index, reason: row.error });
          continue;
        }
        const category = ctx.book.accounts.find((a) => a.id === pick.accountId);
        if (!category || category.archived) {
          result.failed.push({ index: pick.index, reason: 'Choose an open account for this row.' });
          continue;
        }
        if (category.id === ctx.bank.id) {
          result.failed.push({ index: pick.index, reason: 'Choose an account other than the bank account.' });
          continue;
        }
        const ref = ctx.refs.get(row.index) as string;
        if (ctx.known.has(ref)) {
          result.duplicates += 1;
          continue;
        }
        const abs = Math.abs(row.minor);
        const bankSide = row.minor > 0 ? 'debit' : 'credit';
        const otherSide = row.minor > 0 ? 'credit' : 'debit';
        const posted = await service.post(
          {
            bookId,
            entry: {
              date: row.date,
              description: row.description,
              lines: [
                { accountId: ctx.bank.id, side: bankSide, minor: abs },
                { accountId: category.id, side: otherSide, minor: abs },
              ],
              source: { app: appId, kind: 'import', ref },
            },
          },
          { app: appId, kind: 'import', ref },
        );
        if (!posted.ok) {
          result.failed.push({ index: pick.index, reason: posted.message });
          continue;
        }
        if (posted.value.duplicate) result.duplicates += 1;
        else result.posted += 1;
        if (pick.remember) remember.push({ contains: row.description, accountId: category.id });
      }
      if (remember.length > 0) await service.addImportRules(bookId, remember);
      return { ok: true, value: result };
    },
  };
}
