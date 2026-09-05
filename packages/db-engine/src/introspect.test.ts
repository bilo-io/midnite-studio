import { describe, expect, it } from 'vitest';

import { foldSchemaTree, type RawColumnRow } from './introspect';

describe('foldSchemaTree', () => {
  it('groups columns under their table, preserving discovery order', () => {
    const rows: RawColumnRow[] = [
      {
        tableSchema: 'public',
        tableName: 'orders',
        tableKind: 'table',
        columnName: 'id',
        dataType: 'int4',
        nullable: false,
        isPrimaryKey: true,
        references: null,
      },
      {
        tableSchema: 'public',
        tableName: 'orders',
        tableKind: 'table',
        columnName: 'customer_id',
        dataType: 'int4',
        nullable: false,
        isPrimaryKey: false,
        references: { table: 'customers', column: 'id' },
      },
      {
        tableSchema: 'public',
        tableName: 'customers',
        tableKind: 'table',
        columnName: 'id',
        dataType: 'int4',
        nullable: false,
        isPrimaryKey: true,
        references: null,
      },
    ];

    const tree = foldSchemaTree('c1', rows);
    expect(tree.connectionId).toBe('c1');
    expect(tree.tables.map((t) => t.name)).toEqual(['orders', 'customers']);
    expect(tree.tables[0]?.columns).toHaveLength(2);
    expect(tree.tables[0]?.columns[1]?.references).toEqual({ table: 'customers', column: 'id' });
  });

  it('distinguishes tables and views with the same name in different schemas', () => {
    const rows: RawColumnRow[] = [
      {
        tableSchema: 'a',
        tableName: 'widgets',
        tableKind: 'table',
        columnName: 'id',
        dataType: 'int',
        nullable: false,
        isPrimaryKey: true,
        references: null,
      },
      {
        tableSchema: 'b',
        tableName: 'widgets',
        tableKind: 'view',
        columnName: 'id',
        dataType: 'int',
        nullable: true,
        isPrimaryKey: false,
        references: null,
      },
    ];

    const tree = foldSchemaTree('c1', rows);
    expect(tree.tables).toHaveLength(2);
    expect(tree.tables.map((t) => t.kind)).toEqual(['table', 'view']);
  });

  it('omits `schema` entirely for a provider with no namespace (SQLite)', () => {
    const rows: RawColumnRow[] = [
      {
        tableSchema: null,
        tableName: 'notes',
        tableKind: 'table',
        columnName: 'id',
        dataType: 'INTEGER',
        nullable: false,
        isPrimaryKey: true,
        references: null,
      },
    ];
    const tree = foldSchemaTree('c1', rows);
    expect(tree.tables[0]).not.toHaveProperty('schema');
  });
});
