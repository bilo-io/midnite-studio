import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TempRepo } from '../testing/temp-repo';
import { HISTORY_SCAN_ADVICE, scanRepoHistory } from './history-scan';

let repo: TempRepo;

beforeEach(async () => {
  repo = await TempRepo.create();
});

afterEach(async () => {
  await repo.cleanup();
});

describe('scanRepoHistory (Phase 118 Theme F)', () => {
  it('finds a token three commits back in repository history', async () => {
    // 1. Initial commit
    await repo.commitFile('initial.txt', 'hello\n', 'initial commit');

    // 2. Commit containing a secret (3 commits back from HEAD at the end)
    const secretSha = await repo.commitFile(
      'credentials.env',
      'API_KEY=ghp_leakedsecrettoken1234567890abcdef\n',
      'feat: add config',
    );

    // 3. Subsequent commit
    await repo.commitFile('feature1.txt', 'first feature\n', 'feat: first');

    // 4. HEAD commit
    await repo.commitFile('feature2.txt', 'second feature\n', 'feat: second');

    let progressCount = 0;
    const report = await scanRepoHistory(repo.path, {
      onProgress: (p) => {
        progressCount = p.commitsScanned;
      },
    });

    expect(report.scannedCommits).toBe(4);
    expect(progressCount).toBe(4);
    expect(report.advice).toBe(HISTORY_SCAN_ADVICE);

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toMatchObject({
      file: 'credentials.env',
      pattern: 'github-token',
      masked: 'ghp_...cdef',
      commit: secretSha,
    });
  });
});
