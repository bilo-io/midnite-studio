import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { useStatementConfirm } from './statement-confirm';

function Harness({ sql, onRun }: { sql: string; onRun: () => void }) {
  const confirmStatement = useStatementConfirm();
  return (
    <button
      type="button"
      onClick={() => confirmStatement({ sql, connectionName: 'Local Postgres', onRun })}
    >
      Run
    </button>
  );
}

function renderHarness(sql: string) {
  const onRun = vi.fn();
  render(
    <DialogHost>
      <Harness sql={sql} onRun={onRun} />
    </DialogHost>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Run' }));
  return onRun;
}

describe('useStatementConfirm', () => {
  afterEach(() => cleanup());

  it('runs a SELECT immediately, with no dialog', () => {
    const onRun = renderHarness('SELECT * FROM users');
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('runs a plain WITH … SELECT immediately', () => {
    const onRun = renderHarness('WITH recent AS (SELECT * FROM orders) SELECT * FROM recent');
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it('runs EXPLAIN immediately', () => {
    const onRun = renderHarness('EXPLAIN SELECT * FROM users');
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it.each(['UPDATE', 'DELETE', 'DROP', 'TRUNCATE', 'ALTER', 'INSERT'])(
    'gates %s behind a confirm dialog rather than running it',
    (verb) => {
      const sql: Record<string, string> = {
        UPDATE: "UPDATE users SET name = 'x' WHERE id = 1",
        DELETE: 'DELETE FROM users WHERE id = 1',
        DROP: 'DROP TABLE users',
        TRUNCATE: 'TRUNCATE TABLE users',
        ALTER: 'ALTER TABLE users ADD COLUMN x int',
        INSERT: "INSERT INTO users (name) VALUES ('x')",
      };
      const onRun = renderHarness(sql[verb]!);
      expect(onRun).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toBeDefined();
    },
  );

  it('gates WITH … DELETE — the must-not-fail case, since its first keyword reads as a plain WITH', () => {
    const onRun = renderHarness(
      'WITH x AS (SELECT id FROM orders WHERE stale) DELETE FROM y WHERE id IN (SELECT id FROM x)',
    );
    expect(onRun).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('names the connection and shows an estimate only when one is given', () => {
    render(
      <DialogHost>
        <ConfirmOnce sql="DELETE FROM users" estimatedRowCount={42} />
      </DialogHost>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(screen.getByText('Runs against Local Postgres.')).toBeDefined();
    expect(screen.getByText('Estimated 42 rows affected.')).toBeDefined();
  });

  it('runs the statement once the dialog is confirmed', () => {
    const onRun = renderHarness('DELETE FROM users');
    fireEvent.click(screen.getByRole('button', { name: 'Run statement' }));
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it('does not run the statement if the dialog is cancelled', () => {
    const onRun = renderHarness('DELETE FROM users');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onRun).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

function ConfirmOnce({ sql, estimatedRowCount }: { sql: string; estimatedRowCount: number }) {
  const confirmStatement = useStatementConfirm();
  return (
    <button
      type="button"
      onClick={() =>
        confirmStatement({
          sql,
          connectionName: 'Local Postgres',
          estimatedRowCount,
          onRun: () => {},
        })
      }
    >
      Run
    </button>
  );
}
