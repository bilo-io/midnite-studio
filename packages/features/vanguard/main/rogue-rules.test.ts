import type { AgentAuditRecord, SecurityFinding } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import {
  correlateLiveChanges,
  evaluateRogueRules,
  type LiveSession,
  type RogueRuleContext,
} from './rogue-rules';

const HOME = '/Users/me';
const ctx: RogueRuleContext = {
  homeDir: HOME,
  scopeRoots: (sessionId) => (sessionId === 's1' ? ['/Users/me/work/repo'] : []),
};

let n = 0;
const cmd = (command: string, extra: Partial<Extract<AgentAuditRecord, { kind: 'command' }>> = {}): AgentAuditRecord => ({
  id: `r${(n += 1)}`,
  at: 1_000 + n,
  kind: 'command',
  sessionId: 's1',
  command,
  source: 'osc-133',
  cwd: '/Users/me/work/repo',
  ...extra,
});

const rules = (records: AgentAuditRecord[]) => evaluateRogueRules(records, ctx).map((f) => f.rule);

describe('secret-path-read', () => {
  it.each([
    'cat ~/.ssh/id_ed25519',
    'cat $HOME/.aws/credentials',
    'tar czf - /Users/me/.gnupg',
    'ls ~/Library/Keychains',
    'cat ~/.claude.json',
    'cat /Users/me/Library/Application\\ Support/Midnite/secrets.vault.json',
    'cat ../../.ssh/config',
  ])('flags %s as high', (command) => {
    const found = evaluateRogueRules([cmd(command)], ctx).filter((f) => f.rule === 'secret-path-read');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: 'high', sessionId: 's1', category: 'agent' });
  });

  it('flags a sandbox-refused read', () => {
    const record: AgentAuditRecord = { id: 'c', at: 5, kind: 'confine-denial', sessionId: 's1', operation: 'file-read-data', target: '/Users/me/.ssh/id_rsa' };
    expect(rules([record])).toContain('secret-path-read');
  });

  it('the same path twice in a session shares one fingerprint', () => {
    const found = evaluateRogueRules([cmd('cat ~/.ssh/a'), cmd('cat ~/.ssh/a')], ctx);
    expect(new Set(found.map((f) => f.fingerprint)).size).toBe(1);
  });
});

describe('write-outside-scope', () => {
  it.each(['echo x > /Users/me/.zshrc', 'cp build.js ~/Library/LaunchAgents/x.plist', 'rm -rf ../other', 'tee ~/notes.txt'])('flags %s', (command) => {
    expect(rules([cmd(command)])).toContain('write-outside-scope');
  });

  it('flags a write the sandbox refused', () => {
    const record: AgentAuditRecord = { id: 'c', at: 5, kind: 'confine-denial', sessionId: 's1', operation: 'file-write-create', target: '/Users/me/other/x' };
    expect(rules([record])).toContain('write-outside-scope');
  });

  it('leaves in-scope, scratch and null writes alone', () => {
    expect(rules([cmd('echo x > out.txt'), cmd('echo x > /tmp/scratch'), cmd('npm test > /dev/null 2>&1'), cmd('cp a.ts src/b.ts')])).toEqual([]);
  });
});

describe('destructive-git', () => {
  it.each([
    'git push --force origin main',
    'git push -f',
    'git push origin +main',
    'git reset --hard HEAD~3',
    'git clean -fdx',
    'git branch -D feature/x',
    'git rebase -i HEAD~5',
    'git commit --amend --no-edit',
    'git filter-branch --tree-filter x',
    'cd repo && git -C other reset --hard',
  ])('flags %s as high', (command) => {
    const found = evaluateRogueRules([cmd(command)], ctx).filter((f) => f.rule === 'destructive-git');
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]?.severity).toBe('high');
  });

  it('leaves ordinary git alone', () => {
    expect(rules([cmd('git status'), cmd('git commit -m "x"'), cmd('git push origin feature/x'), cmd('git reset --soft HEAD~1'), cmd('git branch feature/y'), cmd('git clean -n')])).toEqual([]);
  });
});

describe('keychain-password', () => {
  it.each(['security find-generic-password -s foo -w', 'security -q find-internet-password -a me'])('flags %s as critical', (command) => {
    const found = evaluateRogueRules([cmd(command)], ctx);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ rule: 'keychain-password', severity: 'critical' });
  });

  it('does not flag other security subcommands', () => {
    expect(rules([cmd('security verify-cert -c x.pem')])).toEqual([]);
  });
});

describe('limit-burst', () => {
  it('is medium and carries the breaker fingerprint', () => {
    const record: AgentAuditRecord = { id: 'l', at: 9, kind: 'limit-trip', sessionId: 's1', limit: 'toolCallsPerMinute', observed: 121, threshold: 120 };
    const found = evaluateRogueRules([record], ctx);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ rule: 'limit-burst', severity: 'medium', fingerprint: 'agents:limit-trip:s1:toolCallsPerMinute' });
  });
});

describe('correlated-change', () => {
  const change = (over: Partial<SecurityFinding>): SecurityFinding => ({
    id: 'f1',
    fingerprint: 'persistence:launchagent:abc',
    source: 'vanguard',
    severity: 'high',
    category: 'persistence',
    title: 'New LaunchAgent: com.evil.plist',
    detail: '',
    evidence: [{ kind: 'path', path: '~/Library/LaunchAgents/com.evil.plist' }],
    remediation: [],
    firstSeen: 300_000,
    lastSeen: 300_000,
    count: 1,
    status: 'open',
    ...over,
  });
  const sessions: LiveSession[] = [
    { sessionId: 'busy', title: 'Claude', lastActivityAt: 290_000 },
    { sessionId: 'idle', lastActivityAt: 1_000 },
    { sessionId: 'unseen', lastActivityAt: null },
  ];

  it('names the live, recently active session in the evidence', () => {
    const found = correlateLiveChanges([change({})], sessions);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ rule: 'correlated-change', severity: 'high', sessionId: 'busy' });
    expect(found[0]?.evidence).toContainEqual(expect.objectContaining({ kind: 'command', command: 'agent session busy' }));
    expect(found[0]?.evidence).toContainEqual({ kind: 'path', path: '~/Library/LaunchAgents/com.evil.plist' });
  });

  it('correlates a new outbound host the same way', () => {
    const found = correlateLiveChanges([change({ category: 'network', fingerprint: 'network:agent:r:x:443', evidence: [{ kind: 'host', host: 'x.example' }] })], sessions);
    expect(found.map((f) => f.sessionId)).toEqual(['busy']);
  });

  it('attributes a change already tied to a session to that one alone, and drops it when it is not live', () => {
    expect(correlateLiveChanges([change({ sessionId: 'idle' })], sessions).map((f) => f.sessionId)).toEqual(['idle']);
    expect(correlateLiveChanges([change({ sessionId: 'gone' })], sessions)).toEqual([]);
  });

  it('ignores other categories and other sources', () => {
    expect(correlateLiveChanges([change({ category: 'malware' }), change({ source: 'guard' })], sessions)).toEqual([]);
  });
});

describe('review fixes', () => {
  it('does not flag a command that only mentions a dangerous one', () => {
    expect(
      rules([
        cmd('git commit -m "docs: security find-generic-password usage"'),
        cmd("grep -r 'security find-internet-password' docs/"),
        cmd('echo git push -f'),
        cmd('git rebase --abort'),
        cmd('git rebase --continue'),
        cmd('git branch --sort=-committerdate'),
        cmd('git branch -vv'),
      ]),
    ).toEqual([]);
  });

  it('still catches the real thing behind sudo or an env prefix', () => {
    expect(rules([cmd('sudo security find-generic-password -w'), cmd('GIT_PAGER=cat git reset --hard')])).toEqual(['destructive-git', 'keychain-password']);
  });

  it('a cwd the agent moved into does not widen the jail', () => {
    expect(rules([cmd('echo x > ./authorized_keys', { cwd: '/Users/me/.ssh' })])).toContain('write-outside-scope');
  });

  it('a repeated word does not confuse a redirect target', () => {
    expect(rules([cmd('cp a a > /Users/me/out.txt')])).toContain('write-outside-scope');
  });
});

describe('a benign /midnite-create run', () => {
  it('yields nothing', () => {
    const run = [
      'git status',
      'git fetch origin main',
      'git worktree add .worktrees/p-x -b feature/p-x',
      'pnpm install --frozen-lockfile',
      'moon run :typecheck :lint :test',
      'git add -A && git commit -m "feat: thing"',
      'git push -u origin feature/p-x',
      'gh pr create --draft --title "feat: thing" --body "ok" > /tmp/pr.txt',
      'npx playwright test --update-snapshots 2>&1 | tail -20',
      'echo done > notes/log.md',
      'curl -s https://api.github.com/repos/bilo-io/midnite-studio',
    ].map((c) => cmd(c));
    const calls: AgentAuditRecord[] = [
      { id: 'm1', at: 5, kind: 'mcp-call', sessionId: 's1', tool: 'git_status', repoPath: '/Users/me/work/repo', ok: true, ms: 12 },
      { id: 'p1', at: 6, kind: 'policy-decision', sessionId: 's1', tool: 'git_status', decision: 'allow', rule: 'default' },
    ];
    expect(evaluateRogueRules([...run, ...calls], ctx)).toEqual([]);
  });
});
