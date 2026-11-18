import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { InvestorUpdate, StartupEmailResult, StartupPdfExport, StartupResult } from '@midnite/studio-shared';

import type { InvoicePdfPort } from './invoice-pdf';
import type { WorkspaceStore } from './workspace-store';

/** The host's save dialog for a text file: the chosen path, or `null` when cancelled. */
export type SaveMarkdownPort = (defaultName: string) => Promise<string | null>;

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s: string): string => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(?<![*\w])\*([^*\n]+)\*(?!\w)/g, '<em>$1</em>');

/**
 * A small, safe Markdown to HTML for the update: headings, bullet and numbered lists, paragraphs, bold and italic.
 * Everything is escaped first, so the page (printed in a script-less window) can carry no markup of its own.
 */
export function renderUpdateHtml(title: string, markdown: string): string {
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let para: string[] = [];
  const flush = (): void => {
    if (para.length > 0) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const close = (): void => {
    if (list !== null) out.push(`</${list}>`);
    list = null;
  };
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const item = /^\s*(?:([-*])|\d+\.)\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      close();
      out.push(`<h${heading[1]!.length + 1}>${inline(heading[2]!)}</h${heading[1]!.length + 1}>`);
    } else if (item) {
      flush();
      const kind = item[1] ? 'ul' : 'ol';
      if (list !== kind) {
        close();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline(item[2]!)}</li>`);
    } else if (line.trim() === '') {
      flush();
      close();
    } else {
      close();
      para.push(line.trim());
    }
  }
  flush();
  close();
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
body{font:13px/1.55 -apple-system,Helvetica,Arial,sans-serif;color:#111;margin:48px;max-width:720px}
h1{font-size:22px;margin:0 0 16px}h2{font-size:16px;margin:22px 0 6px}h3{font-size:14px}ul,ol{padding-left:20px}li{margin:2px 0}
</style></head><body><h1>${esc(title)}</h1>${out.join('\n')}</body></html>`;
}

const fileStem = (u: InvestorUpdate): string => `Investor-update-${u.period}`;

function find(store: WorkspaceStore, id: string): InvestorUpdate | null {
  return store.snapshot().workspace.investorUpdates.find((u) => u.id === id) ?? null;
}

export async function exportInvestorUpdateMd(store: WorkspaceStore, id: string, save: SaveMarkdownPort | undefined): Promise<StartupResult<StartupPdfExport>> {
  const update = find(store, id);
  if (update === null) return { ok: false, kind: 'not-found', message: 'That update no longer exists.' };
  if (save === undefined) return { ok: false, kind: 'invalid', message: 'Saving a file is not available in this build.' };
  try {
    const target = await save(`${fileStem(update)}.md`);
    if (target === null) return { ok: true, value: { saved: false } };
    await writeFile(target, `# ${update.title}\n\n${update.markdown}\n`, 'utf8');
    return { ok: true, value: { saved: true } };
  } catch (error) {
    return { ok: false, kind: 'io', message: `Could not save the file: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export async function exportInvestorUpdatePdf(store: WorkspaceStore, id: string, port: InvoicePdfPort | undefined, tmpRoot: string): Promise<StartupResult<StartupPdfExport>> {
  const update = find(store, id);
  if (update === null) return { ok: false, kind: 'not-found', message: 'That update no longer exists.' };
  if (port === undefined) return { ok: false, kind: 'invalid', message: 'Exporting a PDF is not available in this build.' };
  let dir: string | null = null;
  try {
    const target = await port.savePdf(`${fileStem(update)}.pdf`);
    if (target === null) return { ok: true, value: { saved: false } };
    dir = await mkdtemp(join(tmpRoot, 'update-'));
    const file = join(dir, 'update.html');
    await writeFile(file, renderUpdateHtml(update.title, update.markdown));
    await writeFile(target, await port.printToPdf(file));
    return { ok: true, value: { saved: true } };
  } catch (error) {
    return { ok: false, kind: 'io', message: `Could not export the PDF: ${error instanceof Error ? error.message : String(error)}` };
  } finally {
    if (dir !== null) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** A `mailto:` link longer than this many characters of body is cut, because mail clients' limits vary. */
export const MAILTO_BODY_LIMIT = 1800;
const TRUNCATED_NOTE = '\n\n… (full update copied to clipboard)';

/** What Email draft needs from the host: open a URL in the mail client, and put text on the clipboard. */
export type MailPorts = { openExternal: (url: string) => Promise<void> | void; writeClipboard: (text: string) => void };

/** The `mailto:` link for an update; `truncated` when the body was cut to {@link MAILTO_BODY_LIMIT}. */
export function buildUpdateMailto(title: string, markdown: string): { url: string; truncated: boolean } {
  const truncated = markdown.length > MAILTO_BODY_LIMIT;
  const body = truncated ? `${markdown.slice(0, MAILTO_BODY_LIMIT).trimEnd()}${TRUNCATED_NOTE}` : markdown;
  return { url: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`, truncated };
}

/** Opens the user's mail client on a draft of the update; a long body is cut and the whole text copied instead. */
export async function emailInvestorUpdate(store: WorkspaceStore, id: string, mail: MailPorts | undefined): Promise<StartupResult<StartupEmailResult>> {
  const update = find(store, id);
  if (update === null) return { ok: false, kind: 'not-found', message: 'That update no longer exists.' };
  if (mail === undefined) return { ok: false, kind: 'invalid', message: 'Emailing a draft is not available in this build.' };
  const { url, truncated } = buildUpdateMailto(update.title, update.markdown);
  try {
    if (truncated) mail.writeClipboard(update.markdown);
    await mail.openExternal(url);
    return { ok: true, value: { truncated } };
  } catch (error) {
    return { ok: false, kind: 'io', message: `Could not open the mail client: ${error instanceof Error ? error.message : String(error)}` };
  }
}
