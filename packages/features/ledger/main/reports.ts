import { writeFile } from 'node:fs/promises';

import { buildReport, minorUnitsOf, ReportRangeError, type LedgerErrorKind, type LedgerReport, type LedgerReportKind, type LedgerResult, type ReportRow } from '@midnite/studio-shared';

import type { LedgerService } from './ledger-service';

const fail = (kind: LedgerErrorKind, message: string): { ok: false; kind: LedgerErrorKind; message: string } => ({ ok: false, kind, message });

/** A minor-unit amount as an exact decimal string (`-1234.50`), never through a float. */
export function decimalOf(minor: number, currency: string): string {
  const places = minorUnitsOf(currency);
  const abs = minor < 0 ? -BigInt(minor) : BigInt(minor);
  const scale = 10n ** BigInt(places);
  const body = places === 0 ? `${abs}` : `${abs / scale}.${(abs % scale).toString().padStart(places, '0')}`;
  return minor < 0 ? `-${body}` : body;
}

/** A text cell: quoted when needed, and a leading `=`, `+`, `-` or `@` is neutralised so a spreadsheet never runs an account name. */
export function csvCell(text: string): string {
  const safe = /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** The report as CSV: a section, the account code and name, and the amount as a decimal string. */
export function reportToCsv(report: LedgerReport): string {
  const money = (minor: number): string => decimalOf(minor, report.currency);
  const lines: string[][] = [];
  const section = (name: string, rows: readonly ReportRow[]): void => {
    for (const r of rows) lines.push([name, r.code, r.name, money(r.minor)]);
  };
  const total = (name: string, minor: number): void => void lines.push([name, '', 'Total', money(minor)]);
  let header = ['Section', 'Code', 'Account', 'Amount'];
  switch (report.kind) {
    case 'trial-balance':
      header = ['Code', 'Account', 'Debit', 'Credit'];
      for (const r of report.rows) lines.push([r.code, r.name, money(r.debit), money(r.credit)]);
      lines.push(['', 'Total', money(report.totalDebit), money(report.totalCredit)]);
      break;
    case 'profit-and-loss':
      section('Income', report.income);
      total('Income', report.incomeTotal);
      section('Cost of sales', report.costOfSales);
      total('Cost of sales', report.costOfSalesTotal);
      lines.push(['Gross profit', '', 'Total', money(report.grossProfit)]);
      section('Expenses', report.expenses);
      total('Expenses', report.expensesTotal);
      lines.push(['Net profit', '', 'Total', money(report.netProfit)]);
      break;
    case 'balance-sheet':
      section('Assets', report.assets);
      total('Assets', report.assetsTotal);
      section('Liabilities', report.liabilities);
      total('Liabilities', report.liabilitiesTotal);
      section('Equity', report.equity);
      total('Equity', report.equityTotal);
      lines.push(['Difference', '', 'Assets - liabilities - equity', money(report.difference)]);
      break;
    case 'cash-flow':
      lines.push(['Operating', '', 'Net profit', money(report.netProfit)]);
      section('Operating', report.operating);
      total('Operating', report.operatingTotal);
      section('Investing', report.investing);
      total('Investing', report.investingTotal);
      section('Financing', report.financing);
      total('Financing', report.financingTotal);
      lines.push(['Net change in cash', '', 'Total', money(report.netChange)]);
      lines.push(['Opening cash', '', '', money(report.openingCash)]);
      lines.push(['Closing cash', '', '', money(report.closingCash)]);
      lines.push(['Unreconciled', '', '', money(report.unreconciled)]);
      break;
  }
  return `${[header, ...lines].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export type ReportRequest = { bookId: string; kind: LedgerReportKind; from: string; to: string };

/** Builds one report from the book's journal; a bad range or an unrepresentable total is `invalid`. */
export async function runReport(service: LedgerService, req: ReportRequest): Promise<LedgerResult<LedgerReport>> {
  const snap = await service.snapshot(req.bookId);
  if (!snap.ok) return snap;
  try {
    return { ok: true, value: buildReport(req.kind, snap.value.book, snap.value.entries, req.from, req.to) };
  } catch (err) {
    if (err instanceof ReportRangeError) return fail('invalid', err.message);
    throw err;
  }
}

const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'book';

/** Writes the report to a file the user chose; cancelling the dialog answers `{ path: null }`. */
export async function exportReport(service: LedgerService, req: ReportRequest, saveCsv: (defaultName: string) => Promise<string | null>): Promise<LedgerResult<{ path: string | null }>> {
  const report = await runReport(service, req);
  if (!report.ok) return report;
  const book = await service.getBook(req.bookId);
  const name = book.ok ? slug(book.value.book.name) : 'book';
  const path = await saveCsv(`${name}-${req.kind}-${req.from}-${req.to}.csv`);
  if (path === null) return { ok: true, value: { path: null } };
  await writeFile(path, reportToCsv(report.value), 'utf8');
  return { ok: true, value: { path } };
}
