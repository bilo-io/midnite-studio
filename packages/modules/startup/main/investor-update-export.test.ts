// @vitest-environment node
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { exportInvestorUpdateMd, exportInvestorUpdatePdf, renderUpdateHtml } from './investor-update-export';
import { openWorkspaceStore } from './workspace-store';

const ID = '00000000-0000-4000-8000-000000000001';
const seed = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'startup-upd-'));
  const store = await openWorkspaceStore({ dir });
  await store.mutate((ws) => ({
    ok: true,
    workspace: { ...ws, investorUpdates: [{ id: ID, period: '2026-11', title: 'November <b>', markdown: '## Highlights\n- **Shipped** it\n- <script>x</script>', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', drafts: [] }] },
  }));
  return { dir, store };
};

describe('renderUpdateHtml', () => {
  it('renders headings, lists and emphasis, and escapes everything else', () => {
    const html = renderUpdateHtml('T <i>', '## Highlights\n- **Shipped** it\n- <script>x</script>\n\nPlain *text*.');
    expect(html).toContain('<h3>Highlights</h3>');
    expect(html).toContain('<li><strong>Shipped</strong> it</li>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('<em>text</em>');
    expect(html).toContain('<title>T &lt;i&gt;</title>');
  });
});

describe('exports', () => {
  it('writes the .md where the dialog says, and treats cancel as not saved', async () => {
    const { dir, store } = await seed();
    const target = join(dir, 'out.md');
    expect(await exportInvestorUpdateMd(store, ID, async () => target)).toEqual({ ok: true, value: { saved: true } });
    expect(await readFile(target, 'utf8')).toBe('# November <b>\n\n## Highlights\n- **Shipped** it\n- <script>x</script>\n');
    expect(await exportInvestorUpdateMd(store, ID, async () => null)).toEqual({ ok: true, value: { saved: false } });
    expect(await exportInvestorUpdateMd(store, ID, undefined)).toMatchObject({ ok: false, kind: 'invalid' });
    expect(await exportInvestorUpdateMd(store, 'nope', async () => target)).toMatchObject({ ok: false, kind: 'not-found' });
  });

  it('prints the PDF through the port and removes its temp page', async () => {
    const { dir, store } = await seed();
    const target = join(dir, 'out.pdf');
    let page = '';
    const port = {
      savePdf: async () => target,
      printToPdf: async (file: string) => {
        page = await readFile(file, 'utf8');
        return Buffer.from('%PDF');
      },
    };
    expect(await exportInvestorUpdatePdf(store, ID, port, dir)).toEqual({ ok: true, value: { saved: true } });
    expect(page).toContain('<h3>Highlights</h3>');
    expect(await readFile(target, 'utf8')).toBe('%PDF');
    await writeFile(join(dir, 'keep'), '');
    expect(await exportInvestorUpdatePdf(store, ID, undefined, dir)).toMatchObject({ ok: false, kind: 'invalid' });
  });
});
