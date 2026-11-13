import { describe, expect, it } from 'vitest';

import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('reads a quoted field holding a comma, an escaped quote and a newline', () => {
    const { rows } = parseCsv('date,desc,amount\r\n2026-01-02,"Shop, ""Big"" one\nline 2",-4.50\r\n');
    expect(rows).toEqual([
      ['date', 'desc', 'amount'],
      ['2026-01-02', 'Shop, "Big" one\nline 2', '-4.50'],
    ]);
  });

  it('strips a UTF-8 BOM', () => {
    expect(parseCsv('﻿a,b\n1,2\n').rows[0]).toEqual(['a', 'b']);
  });

  it('sniffs a semicolon file and a tab file', () => {
    expect(parseCsv('a;b;c\n1;2;3').delimiter).toBe(';');
    expect(parseCsv('a;b;c\n1;2;3').rows[1]).toEqual(['1', '2', '3']);
    expect(parseCsv('a\tb\n1\t2\n').delimiter).toBe('\t');
  });

  it('ignores a delimiter inside quotes when sniffing', () => {
    expect(parseCsv('"a;b;c";x\n1;2').delimiter).toBe(';');
    expect(parseCsv('"a;b;c",x,y\n1,2,3').delimiter).toBe(',');
  });

  it('drops a trailing empty line and blank lines, keeps empty cells', () => {
    expect(parseCsv('a,b\n\n1,\n\n').rows).toEqual([
      ['a', 'b'],
      ['1', ''],
    ]);
  });

  it('handles LF-only input and a missing final newline', () => {
    expect(parseCsv('a,b\n1,2').rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('returns no rows for an empty file', () => {
    expect(parseCsv('').rows).toEqual([]);
  });
});
