import type { MidniteStudioBridge, SchemaTree } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConnectionTree } from './connection-tree';

const TREE: SchemaTree = {
  connectionId: 'c1',
  tables: [
    {
      name: 'orders',
      schema: 'public',
      kind: 'table',
      columns: [
        { name: 'id', type: 'int4', nullable: false, isPrimaryKey: true, references: null },
        {
          name: 'customer_id',
          type: 'int4',
          nullable: false,
          isPrimaryKey: false,
          references: { table: 'customers', column: 'id' },
        },
        { name: 'total', type: 'numeric', nullable: true, isPrimaryKey: false, references: null },
      ],
    },
  ],
};

function installBridge(getSchema = vi.fn().mockResolvedValue({ ok: true, data: TREE })) {
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    db: { getSchema } as unknown as MidniteStudioBridge['db'],
  } as Partial<MidniteStudioBridge>;
  return getSchema;
}

function renderTree(props: Partial<Parameters<typeof ConnectionTree>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ConnectionTree connectionId="c1" connectionName="Local Postgres" {...props} />
    </QueryClientProvider>,
  );
}

describe('ConnectionTree', () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('fetches the schema once both fold states agree', async () => {
    const getSchema = installBridge();
    renderTree();
    await screen.findByText('orders');
    expect(getSchema).toHaveBeenCalledWith({ connectionId: 'c1' });
  });

  it('issues no query while an ancestor section is closed, even though the tree itself defaults open', async () => {
    const getSchema = installBridge();
    renderTree({ sectionOpen: false });

    // Give any accidental fetch a chance to fire before asserting its absence.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(getSchema).not.toHaveBeenCalled();
  });

  it('issues no query once the connection row itself is collapsed', async () => {
    const getSchema = installBridge();
    renderTree();
    await screen.findByText('orders');
    expect(getSchema).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Local Postgres/i }));
    // Collapsing must not itself trigger a second call, and nothing else does.
    expect(getSchema).toHaveBeenCalledTimes(1);
  });

  it('renders primary-key and foreign-key markers once a table is expanded', async () => {
    installBridge();
    renderTree();

    fireEvent.click(await screen.findByRole('button', { name: /orders/i }));

    expect(await screen.findByLabelText('Primary key')).toBeDefined();
    expect(screen.getByLabelText('Foreign key to customers.id')).toBeDefined();
  });

  it('shows a prose error rather than a skeleton when the fetch fails', async () => {
    installBridge(vi.fn().mockResolvedValue({ ok: false, kind: 'error', message: 'connection refused' }));
    renderTree();
    expect(await screen.findByText("Couldn't load the schema")).toBeDefined();
    expect(screen.getByText('connection refused')).toBeDefined();
  });
});
