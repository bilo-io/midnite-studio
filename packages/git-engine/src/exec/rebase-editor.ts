import * as fs from 'fs';
import * as path from 'path';
import { RebaseEntry, RebaseSequencePlan } from '@midnite/studio-shared';

/**
 * Parses git-rebase-todo sequence format into RebaseEntry list.
 */
export function parseRebaseTodo(content: string): RebaseEntry[] {
  const entries: RebaseEntry[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const parts = trimmed.split(/\s+/);
    const actionStr = parts[0]?.toLowerCase();
    if (!actionStr) {
      continue;
    }

    // Normalize short action aliases to full names
    let action: RebaseEntry['action'];
    switch (actionStr) {
      case 'p':
      case 'pick':
        action = 'pick';
        break;
      case 'r':
      case 'reword':
        action = 'reword';
        break;
      case 'e':
      case 'edit':
        action = 'edit';
        break;
      case 's':
      case 'squash':
        action = 'squash';
        break;
      case 'f':
      case 'fixup':
        action = 'fixup';
        break;
      case 'd':
      case 'drop':
        action = 'drop';
        break;
      case 'b':
      case 'break':
        action = 'break';
        break;
      case 'x':
      case 'exec':
        action = 'exec';
        break;
      default:
        continue;
    }

    if (action === 'exec') {
      const execCommand = parts.slice(1).join(' ');
      entries.push({
        id: `exec-${Math.random().toString(36).substring(2, 9)}`,
        action,
        execCommand,
      });
    } else if (action === 'break') {
      entries.push({
        id: `break-${Math.random().toString(36).substring(2, 9)}`,
        action,
      });
    } else {
      const sha = parts[1] || '';
      const subject = parts.slice(2).join(' ') || '';
      entries.push({
        id: sha || `item-${Math.random().toString(36).substring(2, 9)}`,
        action,
        sha,
        subject,
      });
    }
  }

  return entries;
}

/**
 * Serializes RebaseEntry list into git-rebase-todo format.
 */
export function formatRebaseTodo(entries: RebaseEntry[]): string {
  const lines: string[] = [];

  for (const entry of entries) {
    if (entry.action === 'exec') {
      lines.push(`exec ${entry.execCommand || ''}`);
    } else if (entry.action === 'break') {
      lines.push('break');
    } else if (entry.action === 'drop') {
      lines.push(`drop ${entry.sha || ''} ${entry.subject || ''}`.trim());
    } else {
      lines.push(`${entry.action} ${entry.sha || ''} ${entry.subject || ''}`.trim());
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Helper script launcher / editor script generator for GIT_SEQUENCE_EDITOR.
 */
export function createRebaseSequenceManifest(
  dotGitPath: string,
  plan: RebaseSequencePlan,
): string {
  const manifestPath = path.join(dotGitPath, 'midnite-rebase-plan.json');
  fs.writeFileSync(manifestPath, JSON.stringify(plan, null, 2), 'utf-8');
  return manifestPath;
}
