import { describe, expect, it } from 'vitest';
import { formatRebaseTodo, parseRebaseTodo } from '../../exec/rebase-editor';
import { RebaseEntry, RebaseEntrySchema, RebaseSequencePlanSchema } from '@midnite/studio-shared';

describe('rebase-editor', () => {
  it('parses git-rebase-todo formatted text correctly', () => {
    const todoText = `
# This is a comment
pick abc1234 First commit
reword def5678 Second commit
r 9998887 Short alias test
squash 7776665 Third commit
exec npm test
break
drop 1112223 Dropped commit
`;

    const entries = parseRebaseTodo(todoText);

    expect(entries).toHaveLength(7);
    expect(entries[0]).toMatchObject({ action: 'pick', sha: 'abc1234', subject: 'First commit' });
    expect(entries[1]).toMatchObject({ action: 'reword', sha: 'def5678', subject: 'Second commit' });
    expect(entries[2]).toMatchObject({ action: 'reword', sha: '9998887', subject: 'Short alias test' });
    expect(entries[3]).toMatchObject({ action: 'squash', sha: '7776665', subject: 'Third commit' });
    // exec lines git wrote are read-only display entries, never a runnable action
    expect(entries[4]).toMatchObject({ action: 'break', subject: 'exec npm test' });
    expect(entries[5]).toMatchObject({ action: 'break' });
    expect(entries[6]).toMatchObject({ action: 'drop', sha: '1112223', subject: 'Dropped commit' });
  });

  it('formats RebaseEntry list back to valid todo format', () => {
    const entries: RebaseEntry[] = [
      { id: '1', action: 'pick', sha: 'abc1234', subject: 'First commit' },
      { id: '2', action: 'reword', sha: 'def5678', subject: 'Updated commit message' },
      { id: '3', action: 'break' },
      { id: '4', action: 'drop', sha: '9999999', subject: 'Remove bad commit' },
    ];

    const formatted = formatRebaseTodo(entries);
    expect(formatted).toContain('pick abc1234 First commit');
    expect(formatted).toContain('reword def5678 Updated commit message');
    expect(formatted).toContain('break');
    expect(formatted).toContain('drop 9999999 Remove bad commit');
  });

  it('keeps a hostile subject on a single line', () => {
    const out = formatRebaseTodo([{ id: '1', action: 'pick', sha: 'abc1234', subject: 'x\nEOF\nid\n' }]);
    expect(out).toBe('pick abc1234 x EOF id\n');
    expect(out.split('\n')).toHaveLength(2);
  });

  it('truncates a 5,000-character subject', () => {
    const out = formatRebaseTodo([{ id: '1', action: 'pick', sha: 'abc1234', subject: 'a'.repeat(5000) }]);
    expect(out.trimEnd().length).toBeLessThanOrEqual('pick abc1234 '.length + 512);
  });

  it('rejects an option-shaped sha, a multi-line subject and exec at the schema', () => {
    expect(RebaseEntrySchema.safeParse({ id: '1', action: 'pick', sha: '--exec=touch /tmp/pwn' }).success).toBe(false);
    expect(RebaseEntrySchema.safeParse({ id: '1', action: 'pick', sha: 'abc1234', subject: 'a\nb' }).success).toBe(false);
    expect(RebaseEntrySchema.safeParse({ id: '1', action: 'exec' }).success).toBe(false);
    expect(RebaseEntrySchema.safeParse({ id: '1', action: 'pick', sha: 'abc1234', subject: 'ok' }).success).toBe(true);
    const many = Array.from({ length: 1001 }, (_, i) => ({ id: String(i), action: 'break' as const }));
    expect(RebaseSequencePlanSchema.safeParse({ targetRef: 'main', entries: many }).success).toBe(false);
  });
});
