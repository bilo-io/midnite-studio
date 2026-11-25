import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import {
  buildReport, findChrome, gather, injectTemplate, normalisePrs, parseArgs, phaseFromTitle, phaseRows, phaseTotals,
  renderMarkdown, renderPdf, shippedCounts, statusMix, TEMPLATE_REL,
} from './git-report.mjs';
import { addDays, addMonths, resolveWindow, retroWindow, sastDate, searchRange, utcToSastHM, wantsPdf } from './sast.mjs';

const root = new URL('../../', import.meta.url);
const template = readFileSync(new URL(TEMPLATE_REL, root), 'utf8');

describe('SAST window math', () => {
  it('derives the SAST date from a UTC instant across midnight', () => {
    expect(sastDate(new Date('2026-11-17T21:59:00Z'))).toBe('2026-11-17');
    expect(sastDate(new Date('2026-11-17T22:00:00Z'))).toBe('2026-11-18');
  });
  it('converts UTC merge times by +2h, not the raw HH:MM', () => {
    expect(utcToSastHM('2026-11-17T16:19:00Z')).toBe('18:19');
    expect(utcToSastHM('2026-11-17T23:30:00Z')).toBe('01:30');
    expect(utcToSastHM('nope')).toBe('--:--');
  });
  it('resolves today / yesterday / date / range', () => {
    const now = new Date('2026-11-17T10:00:00Z'); // Tuesday
    expect(resolveWindow('today', now)).toMatchObject({ start: '2026-11-17', end: '2026-11-17', singleDay: true });
    expect(resolveWindow('yesterday', now)).toMatchObject({ start: '2026-11-16', end: '2026-11-16' });
    expect(resolveWindow('2026-11-01', now).start).toBe('2026-11-01');
    expect(resolveWindow('2026-11-01..2026-11-10', now)).toMatchObject({ start: '2026-11-01', end: '2026-11-10', singleDay: false });
  });
  it('this-week starts Monday and this-month on the 1st (SAST)', () => {
    const now = new Date('2026-11-17T10:00:00Z');
    expect(resolveWindow('this-week', now).start).toBe('2026-11-16');
    expect(resolveWindow('this-month', now).start).toBe('2026-11-01');
    expect(resolveWindow('this-week', new Date('2026-11-15T10:00:00Z')).start).toBe('2026-11-09'); // Sunday
  });
  it('pins the gh search to +02:00 on both bounds', () => {
    expect(resolveWindow('2026-11-17').search).toBe('2026-11-17T00:00:00+02:00..2026-11-17T23:59:59+02:00');
    expect(searchRange('a', 'b')).toBe('aT00:00:00+02:00..bT23:59:59+02:00');
  });
  it('rejects bad specs, impossible dates and reversed ranges', () => {
    expect(() => resolveWindow('lastweek')).toThrow(/unknown window/);
    expect(() => resolveWindow('2026-02-31')).toThrow(/invalid date/);
    expect(() => resolveWindow('2026-11-10..2026-11-01')).toThrow(/after end/);
  });
  it('clamps month arithmetic and retro windows', () => {
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(retroWindow('3m', new Date('2026-11-17T10:00:00Z'))).toEqual({ start: '2026-08-17', end: '2026-11-17', span: '3m' });
    expect(retroWindow('1y', new Date('2026-11-17T10:00:00Z')).start).toBe('2025-11-17');
    expect(() => retroWindow('2y')).toThrow();
  });
  it('exports a PDF for complete days, and for today only from 22:00 SAST', () => {
    const win = resolveWindow('today', new Date('2026-11-17T10:00:00Z'));
    expect(wantsPdf(win, new Date('2026-11-17T10:00:00Z'))).toBe(false); // 12:00 SAST
    expect(wantsPdf(win, new Date('2026-11-17T20:00:00Z'))).toBe(true); // 22:00 SAST
    expect(wantsPdf(resolveWindow('2026-11-16'), new Date('2026-11-17T10:00:00Z'))).toBe(true);
  });
});

describe('phase + PR shaping', () => {
  it('reads phase and theme out of a title', () => {
    expect(phaseFromTitle('feat(x): foo (phase 150 B)')).toEqual({ phase: 150, theme: null });
    expect(phaseFromTitle('Phase 25 Theme D: stuff')).toEqual({ phase: 25, theme: 'D' });
    expect(phaseFromTitle('fix: nothing')).toEqual({ phase: null, theme: null });
  });
  const raw = [
    { number: 1, title: 'a (phase 5)', url: 'u1', mergedAt: '2026-11-17T08:00:00Z', additions: 10, deletions: 2, author: { login: 'bilo-io' } },
    { number: 2, title: 'b', url: 'u2', mergedAt: '2026-11-17T16:19:00Z', additions: 1, deletions: 1, author: { login: 'x' } },
  ];
  it('sorts newest first and converts times to SAST', () => {
    const prs = normalisePrs(raw);
    expect(prs.map((p) => p.number)).toEqual([2, 1]);
    expect(prs[0].time).toBe('18:19');
  });
  it('buckets the status mix', () => {
    const prs = normalisePrs(raw);
    expect(statusMix([{ number: 1, state: 'MERGED' }, { number: 3, state: 'OPEN' }, { number: 4, state: 'CLOSED' }], prs)).toEqual({ merged: 2, open: 1, closed: 1 });
  });
  it('counts theme sub-issues closed in the window per phase', () => {
    expect(shippedCounts([{ phase: 148 }, { phase: 148 }, { phase: 2 }, { phase: null }])).toEqual({ 148: 2, 2: 1, '—': 1 });
    expect(shippedCounts(undefined)).toEqual({});
  });
  it('turns tracker index rows into open-phase progress rows', () => {
    const idx = [
      { number: 1, phase: 150, name: 'Fleet', state: 'open', category: 'features', themesDone: 3, themes: 4, wipThemes: ['C'], todoThemes: ['D'] },
      { number: 2, phase: 149, name: 'Old', state: 'closed', category: 'features', themesDone: null, themes: null },
      { number: 3, phase: 151, name: 'New', state: 'open', category: 'issues', themesDone: 0, themes: 0, wipThemes: [], todoThemes: [] },
    ];
    const rows = phaseRows(idx);
    expect(rows.map((r) => r.phase)).toEqual([151, 150]);
    expect(rows[1]).toMatchObject({ phase: 150, title: 'Fleet', status: 'wip', done: 3, total: 4, pct: 75, wip: 'C', todo: 'D' });
    expect(rows[0]).toMatchObject({ status: 'todo', pct: 0, wip: '—' });
    expect(phaseTotals(idx)).toEqual({ complete: 1, total: 3 });
  });
});

const win = resolveWindow('2026-11-17');
const prs = normalisePrs([
  { number: 7, title: 'feat: x (phase 150 B)', url: 'https://x/7', mergedAt: '2026-11-17T16:19:00Z', additions: 100, deletions: 4, author: { login: 'a' } },
  { number: 8, title: 'chore: y', url: 'https://x/8', mergedAt: '2026-11-17T09:00:00Z', additions: 5, deletions: 5, author: { login: 'a' } },
]);
const phases = [{ category: 'FEATURES', phase: 150, title: 'Fleet', status: 'wip', done: 12, total: 41, pct: 29, wip: 'C', todo: 'D' }];
const report = buildReport({ window: win, prs, status: { merged: 2, open: 1, closed: 0 }, phases, shipped: { 150: 2 }, generated: '18:00 SAST' });

describe('report + template', () => {
  it('builds the headline and totals deterministically', () => {
    expect(report.headline).toContain('2 PRs');
    expect(report.linesAdded).toBe('+105');
    expect(report.tackled.find((t) => t.phase === 150)).toMatchObject({ items: 2, additions: 100 });
  });
  it('renders SAST times and links in markdown', () => {
    const md = renderMarkdown(report);
    expect(md).toContain('# 📈 Git report — 2026-11-17');
    expect(md).toContain('[#7](https://x/7)');
    expect(md).toContain('18:19');
    expect(md).toContain('150 · Theme B'.replace(' · Theme B', '')); // phase cell present
  });
  it('injects the DATA block and leaves the markers and the rest of the template intact', () => {
    const html = injectTemplate(template, report);
    expect(html).toContain('/* DATA-START */\nconst DATA = {');
    expect(html).toContain('/* DATA-END */');
    const block = html.slice(html.indexOf('const DATA = ') + 13, html.indexOf(';\n/* DATA-END */'));
    const data = JSON.parse(block);
    expect(data.prs[0]).toEqual([7, 'feat: x (phase 150 B)', '150', 100, 4, '18:19']);
    expect(data.phases[0]).toEqual([150, 'Fleet', 'wip', 12, 41, 29]);
    expect(html).toContain('document.getElementById("prs")');
  });
  it('escapes < so a title cannot close the script', () => {
    const evil = buildReport({ ...{ window: win, status: report.status, phases, generated: 'x' }, prs: normalisePrs([{ number: 1, title: '</script><b>', url: 'u', mergedAt: '2026-11-17T08:00:00Z' }]) });
    expect(injectTemplate(template, evil)).not.toContain('</script><b>');
  });
  it('refuses a template with no markers', () => {
    expect(() => injectTemplate('<html></html>', report)).toThrow(/DATA-START/);
  });
});

describe('gather + pdf (no network, no Chrome)', () => {
  it('falls back to empty PR sections when gh is unauthed', async () => {
    const ghApi = { ghJson: async () => ({ ok: false, kind: 'auth', message: 'x' }) };
    const tracker = { index: async () => ({ ok: false, kind: 'auth' }), closedThemes: async () => ({ ok: false, kind: 'auth' }) };
    const g = await gather(win, { ghApi, tracker });
    expect(g.prs).toEqual([]);
    expect(g.phases).toEqual([]);
    expect(g.notes[0]).toMatch(/gh unavailable \(auth\)/);
    expect(g.notes).toEqual(expect.arrayContaining([expect.stringMatching(/tracker unavailable/)]));
  });
  it('queries merged PRs with the SAST-pinned search', async () => {
    const ghJson = vi.fn(async () => ({ ok: true, data: [] }));
    const closedThemes = vi.fn(async () => ({ ok: true, themes: [{ phase: 150 }] }));
    const tracker = { index: async () => ({ ok: true, phases: [{ phase: 150, name: 'F', state: 'open', themesDone: 1, themes: 2, wipThemes: [], todoThemes: ['B'] }] }), closedThemes };
    const g = await gather(win, { ghApi: { ghJson }, tracker });
    expect(ghJson.mock.calls[0][0]).toContain(`merged:${win.search}`);
    expect(closedThemes).toHaveBeenCalledWith(win.search);
    expect(g).toMatchObject({ shipped: { 150: 1 }, totals: { complete: 0, total: 1 } });
    expect(buildReport({ window: win, ...g, generated: 'x' }).phasesComplete).toBe('0 / 1');
  });
  it('finds Chrome via CHROME_PATH first and returns null when none exists', () => {
    expect(findChrome((p) => p === '/c', { CHROME_PATH: '/c' })).toBe('/c');
    expect(findChrome(() => false, {})).toBeNull();
  });
  it('skips the PDF without failing when Chrome is absent, and passes print flags otherwise', async () => {
    expect(await renderPdf({ chrome: null, htmlPath: '/a.html', pdfPath: '/a.pdf' })).toMatchObject({ ok: false });
    const exec = vi.fn((bin, args, opts, cb) => cb(null));
    expect(await renderPdf({ chrome: '/chrome', htmlPath: '/a.html', pdfPath: '/a.pdf', exec })).toEqual({ ok: true, path: '/a.pdf' });
    expect(exec.mock.calls[0][1]).toEqual(expect.arrayContaining(['--headless=new', '--print-to-pdf=/a.pdf', 'file:///a.html']));
  });
  it('parses CLI flags', () => {
    expect(parseArgs(['this-week', '--no-pdf', '--json', '--no-llm'])).toMatchObject({ spec: 'this-week', pdf: 'no', json: true, noLlm: true });
  });
});
