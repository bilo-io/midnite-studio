import { describe, expect, it } from 'vitest';
import { formatRebaseTodo, parseRebaseTodo } from '../../exec/rebase-editor';
import { RebaseEntry } from '@midnite/git-shared';

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
    expect(entries[4]).toMatchObject({ action: 'exec', execCommand: 'npm test' });
    expect(entries[5]).toMatchObject({ action: 'break' });
    expect(entries[6]).toMatchObject({ action: 'drop', sha: '1112223', subject: 'Dropped commit' });
  });

  it('formats RebaseEntry list back to valid todo format', () => {
    const entries: RebaseEntry[] = [
      { id: '1', action: 'pick', sha: 'abc1234', subject: 'First commit' },
      { id: '2', action: 'reword', sha: 'def5678', subject: 'Updated commit message' },
      { id: '3', action: 'exec', execCommand: 'pnpm test' },
      { id: '4', action: 'drop', sha: '9999999', subject: 'Remove bad commit' },
    ];

    const formatted = formatRebaseTodo(entries);
    expect(formatted).toContain('pick abc1234 First commit');
    expect(formatted).toContain('reword def5678 Updated commit message');
    expect(formatted).toContain('exec pnpm test');
    expect(formatted).toContain('drop 9999999 Remove bad commit');
  });
});
