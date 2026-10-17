import { describe, expect, it } from 'vitest';

import type { SchemaTree } from '@midnite/studio-shared';

import { detectEditableTable } from './detect-editable-table';

const tree: SchemaTree = {
  connectionId: 'c1',
  tables: [
    {
      name: 'users',
      schema: 'public',
      kind: 'table',
      columns: [
        { name: 'id', type: 'int4', nullable: false, isPrimaryKey: true, references: null },
        { name: 'email', type: 'text', nullable: false, isPrimaryKey: false, references: null },
      ],
    },
    {
      name: 'no_pk',
      kind: 'table',
      columns: [{ name: 'n', type: 'int', nullable: true, isPrimaryKey: false, references: null }],
    },
  ],
};

describe('detectEditableTable', () => {
  it('recognises a plain SELECT * FROM table', () => {
    expect(detectEditableTable('SELECT * FROM users', tree)).toEqual({
      schema: 'public',
      name: 'users',
      primaryKeyColumns: ['id'],
    });
  });

  it('recognises a quoted, schema-qualified table with a LIMIT', () => {
    expect(detectEditableTable('SELECT * FROM "public"."users" LIMIT 200', tree)).toEqual({
      schema: 'public',
      name: 'users',
      primaryKeyColumns: ['id'],
    });
  });

  it('recognises a bracket-quoted (MSSQL) table with no schema', () => {
    const noSchemaTree: SchemaTree = { connectionId: 'c1', tables: [tree.tables[1]!] };
    expect(detectEditableTable('SELECT * FROM [no_pk]', noSchemaTree)).toBeNull();
  });

  it('returns null for a table with no detected primary key', () => {
    expect(detectEditableTable('SELECT * FROM no_pk', tree)).toBeNull();
  });

  it('returns null for a join', () => {
    expect(detectEditableTable('SELECT * FROM users JOIN no_pk ON 1=1', tree)).toBeNull();
  });

  it('returns null for an explicit column list', () => {
    expect(detectEditableTable('SELECT id, email FROM users', tree)).toBeNull();
  });

  it('returns null for an aggregate', () => {
    expect(detectEditableTable('SELECT COUNT(*) FROM users', tree)).toBeNull();
  });

  it('returns null when the schema tree has not loaded yet', () => {
    expect(detectEditableTable('SELECT * FROM users', undefined)).toBeNull();
  });

  it('returns null when the table is not in the schema tree', () => {
    expect(detectEditableTable('SELECT * FROM ghost', tree)).toBeNull();
  });
});
