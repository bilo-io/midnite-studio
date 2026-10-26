import type { SecretFinding } from '@midnite/studio-shared';
import { scanDiff } from '@midnite/studio-shared';

import { execGit } from '../exec/git-exec';

export interface HistoryScanProgress {
  commitsScanned: number;
  currentSha?: string;
}

export interface HistoryScanReport {
  scannedCommits: number;
  findings: SecretFinding[];
  advice: string;
}

export const HISTORY_SCAN_ADVICE =
  'This secret is in history; rotate the secret with the provider, then rewrite if you must.';

const COMMIT_DELIMITER = '===MIDNITE_COMMIT_BOUNDARY===';

/**
 * Walks repository history (`git log -p -z`), scanning commit diffs for secrets.
 * Produces a report of findings and the standard guidance; never rewrites history.
 */
export async function scanRepoHistory(
  worktreePath: string,
  options?: {
    maxCommits?: number;
    extraSecrets?: string[];
    onProgress?: (progress: HistoryScanProgress) => void;
  },
): Promise<HistoryScanReport> {
  const args = [
    'log',
    '-p',
    '-z',
    `--pretty=format:${COMMIT_DELIMITER}%H%x00%s%x00`,
  ];

  if (options?.maxCommits && options.maxCommits > 0) {
    args.push(`-n`, String(options.maxCommits));
  }

  const res = await execGit(worktreePath, args);
  if (res.exitCode !== 0 || !res.stdout) {
    return {
      scannedCommits: 0,
      findings: [],
      advice: HISTORY_SCAN_ADVICE,
    };
  }

  const chunks = res.stdout.split(COMMIT_DELIMITER).filter((c) => c.trim().length > 0);
  const allFindings: SecretFinding[] = [];
  let scannedCommits = 0;

  for (const chunk of chunks) {
    // Format: <sha>\0<subject>\0\n<diff...>
    const firstNul = chunk.indexOf('\0');
    if (firstNul === -1) continue;

    const sha = chunk.slice(0, firstNul).trim();
    const afterFirst = chunk.slice(firstNul + 1);
    const secondNul = afterFirst.indexOf('\0');
    const diffText = secondNul !== -1 ? afterFirst.slice(secondNul + 1) : afterFirst;

    scannedCommits += 1;
    options?.onProgress?.({ commitsScanned: scannedCommits, currentSha: sha });

    const diffFindings = scanDiff(diffText, {
      commit: sha,
      extraSecrets: options?.extraSecrets,
    });

    for (const f of diffFindings) {
      allFindings.push({
        ...f,
        commit: sha,
      });
    }
  }

  return {
    scannedCommits,
    findings: allFindings,
    advice: HISTORY_SCAN_ADVICE,
  };
}
