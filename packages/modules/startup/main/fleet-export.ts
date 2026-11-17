// Phase 152 E: the fleet projection and the runway as CSV, and the projection as a one-page A4-landscape PDF source.
// Pure string builders; `service.ts` owns the dialogs and the files. The HTML is script-less and makes no request.
import {
  formatMoney,
  minorExponent,
  type CompanyProfile,
  type FleetCatalog,
  type FleetProjection,
  type FleetProjectionResult,
} from '@midnite/studio-shared';

import { escapeHtml } from './invoice-html';
import type { RunwayProjection } from './runway';

const BOM = '﻿';
const EOL = '\r\n';

/** RFC 4180: quote a field holding a comma, a quote or a line break, doubling inner quotes. */
export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** A text cell a spreadsheet could read as a formula gets a leading apostrophe (OWASP); amounts never go through here. */
export const textCell = (value: string): string => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);

const csvRow = (cells: readonly string[]): string => cells.map(csvField).join(',') + EOL;

/** Decimal major units from minor units (`1234` USD -> `12.34`, JPY has no decimals). */
export function majorUnits(minor: number, currency: string): string {
  const exp = minorExponent(currency);
  return (Math.round(minor) / 10 ** exp).toFixed(exp);
}

/** Two sections split by a blank line: the month series, then the node table. UTF-8 with a BOM so Excel opens it. */
export function fleetProjectionCsv(p: FleetProjection, result: FleetProjectionResult, catalog: FleetCatalog, currency: string): string {
  const m = (minor: number): string => majorUnits(minor, currency);
  let out = BOM + csvRow(['month', 'energy', 'api', 'opex', 'revenue', 'net', 'cumulative']);
  for (const row of result.series) {
    out += csvRow([String(row.month + 1), m(row.energy), m(row.api), m(row.energy + row.api), m(row.revenue), m(row.net), m(row.cumulative)]);
  }
  out += EOL + csvRow(['node', 'hardware', 'api tier', 'quantity', 'utilisation %', 'price per hour', 'capex', 'opex', 'net']);
  for (const n of p.nodes) {
    const f = result.perNode[n.id] ?? { capex: 0, opex: 0, revenue: 0, net: 0 };
    out += csvRow([
      textCell(n.name),
      textCell(catalog.hardware.find((h) => h.id === n.hardwareId)?.label ?? `Missing (${n.hardwareId})`),
      textCell(catalog.apiTiers.find((t) => t.id === n.apiTierId)?.label ?? `Missing (${n.apiTierId})`),
      String(n.quantity),
      String(n.utilisationPct),
      m(n.pricePerHourMinor),
      m(f.capex),
      m(f.opex),
      m(f.net),
    ]);
  }
  return out;
}

export function runwayCsv(projection: RunwayProjection, currency: string): string {
  let out = BOM + csvRow(['month', 'revenue', 'costs', 'net', 'cash']);
  for (const r of projection.months) {
    out += csvRow([r.month, majorUnits(r.revenueMinor, currency), majorUnits(r.costMinor, currency), majorUnits(r.netMinor, currency), majorUnits(r.cashMinor, currency)]);
  }
  return out;
}

/** A file name safe on every OS: only `[\w .-]`, never empty. */
export function safeFileName(name: string, fallback: string): string {
  const cleaned = name.replace(/[^\w .-]/g, '').trim();
  return cleaned === '' ? fallback : cleaned;
}

const W = 960;
const H = 260;
const PAD = { l: 64, r: 64, t: 12, b: 24 };

/** The chart in plain SVG: monthly energy, API and net as stacked areas (left scale), cumulative as a line (right scale). */
function chartSvg(result: FleetProjectionResult, currency: string): string {
  const s = result.series;
  if (s.length === 0) return '';
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (i: number): number => PAD.l + (s.length === 1 ? iw / 2 : (i / (s.length - 1)) * iw);
  const stackTop = (i: number): number => Math.max(s[i]!.revenue, s[i]!.energy + s[i]!.api, 0);
  const maxLeft = Math.max(1, ...s.map((_, i) => stackTop(i)));
  const cums = s.map((r) => r.cumulative);
  const minR = Math.min(0, ...cums);
  const maxR = Math.max(1, ...cums);
  const yl = (v: number): number => PAD.t + ih - (v / maxLeft) * ih;
  const yr = (v: number): number => PAD.t + ih - ((v - minR) / (maxR - minR)) * ih;
  const f = (n: number): string => n.toFixed(1);
  const area = (top: (i: number) => number, bottom: (i: number) => number): string => {
    const up = s.map((_, i) => `${i === 0 ? 'M' : 'L'}${f(x(i))} ${f(yl(top(i)))}`).join(' ');
    const down = s.map((_, i) => `L${f(x(s.length - 1 - i))} ${f(yl(bottom(s.length - 1 - i)))}`).join(' ');
    return `${up} ${down} Z`;
  };
  const energy = (i: number): number => s[i]!.energy;
  const opex = (i: number): number => s[i]!.energy + s[i]!.api;
  const revenue = (i: number): number => Math.max(0, s[i]!.revenue);
  const line = s.map((r, i) => `${i === 0 ? 'M' : 'L'}${f(x(i))} ${f(yr(r.cumulative))}`).join(' ');
  const fmt = (v: number): string => escapeHtml(formatMoney(v, currency));
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Monthly revenue and costs with the cumulative line">
<path d="${area(opex, () => 0)}" fill="#f59e0b" fill-opacity="0.55"/>
<path d="${area(energy, () => 0)}" fill="#ef4444" fill-opacity="0.55"/>
<path d="${area(revenue, () => 0)}" fill="#10b981" fill-opacity="0.25"/>
<path d="${line}" fill="none" stroke="#2563eb" stroke-width="2"/>
<line x1="${PAD.l}" y1="${f(yr(0))}" x2="${W - PAD.r}" y2="${f(yr(0))}" stroke="#999" stroke-dasharray="3 3"/>
<text x="${PAD.l - 6}" y="${PAD.t + 8}" text-anchor="end" font-size="10">${fmt(maxLeft)}</text>
<text x="${PAD.l - 6}" y="${PAD.t + ih}" text-anchor="end" font-size="10">${fmt(0)}</text>
<text x="${W - PAD.r + 6}" y="${PAD.t + 8}" font-size="10">${fmt(maxR)}</text>
<text x="${W - PAD.r + 6}" y="${PAD.t + ih}" font-size="10">${fmt(minR)}</text>
<text x="${PAD.l}" y="${H - 6}" font-size="10">Month 1</text>
<text x="${W - PAD.r}" y="${H - 6}" text-anchor="end" font-size="10">Month ${s.length}</text>
</svg>`;
}

/** One A4-landscape page: header, six KPIs, the SVG chart and the node table. Self-contained: no script, no request. */
export function renderFleetProjectionHtml(
  p: FleetProjection,
  result: FleetProjectionResult,
  catalog: FleetCatalog,
  currency: string,
  company: CompanyProfile | null,
  date: string,
): string {
  const money = (minor: number): string => escapeHtml(formatMoney(minor, currency));
  const payback = result.paybackMonths === null ? `Not within ${p.globals.horizonMonths} mo` : `${result.paybackMonths} mo`;
  const kpis: [string, string][] = [
    ['CapEx', money(result.capexMinor)],
    ['OpEx /mo', money(result.opexMonthlyMinor)],
    ['Revenue /mo', money(result.revenueMonthlyMinor)],
    ['Net margin /mo', money(result.netMarginMonthlyMinor)],
    ['Margin %', result.marginPct === null ? '—' : `${result.marginPct.toFixed(1)} %`],
    ['Payback', escapeHtml(payback)],
  ];
  const tiles = kpis.map(([k, v]) => `<div class="k"><span>${escapeHtml(k)}</span><b>${v}</b></div>`).join('');
  const rows = p.nodes
    .map((n) => {
      const fig = result.perNode[n.id] ?? { capex: 0, opex: 0, revenue: 0, net: 0 };
      const hw = catalog.hardware.find((h) => h.id === n.hardwareId)?.label ?? `Missing (${n.hardwareId})`;
      const tier = catalog.apiTiers.find((t) => t.id === n.apiTierId)?.label ?? `Missing (${n.apiTierId})`;
      return `<tr><td>${escapeHtml(n.name)}${n.enabled ? '' : ' (off)'}</td><td>${escapeHtml(hw)}</td><td>${escapeHtml(tier)}</td><td class="n">${n.quantity}</td><td class="n">${n.utilisationPct}%</td><td class="n">${money(fig.capex)}</td><td class="n">${money(fig.opex)}</td><td class="n">${money(fig.net)}</td></tr>`;
    })
    .join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(p.name)}</title>
<style>
@page{size:A4 landscape;margin:12mm}
body{font:11px/1.4 -apple-system,Helvetica,Arial,sans-serif;color:#111;margin:0}
h1{font-size:20px;margin:0}
.muted{color:#666}
.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin:10px 0}
.k{border:1px solid #ddd;border-radius:6px;padding:6px 8px}
.k span{display:block;color:#666;font-size:10px}
.k b{font-size:15px}
table{width:100%;border-collapse:collapse;margin-top:8px}
th,td{padding:3px 6px;border-bottom:1px solid #ddd;text-align:left}
.n{text-align:right}
</style></head><body>
<h1>${escapeHtml(p.name)}</h1>
<div class="muted">${company ? `${escapeHtml(company.name)} · ` : ''}${escapeHtml(date)} · ${p.globals.horizonMonths} months · ${escapeHtml(currency)}</div>
<div class="kpis">${tiles}</div>
${chartSvg(result, currency)}
<table><thead><tr><th>Node</th><th>Hardware</th><th>API tier</th><th class="n">Qty</th><th class="n">Util</th><th class="n">CapEx</th><th class="n">OpEx /mo</th><th class="n">Net /mo</th></tr></thead><tbody>${rows}</tbody></table>
</body></html>`;
}
