import type { ReactNode } from 'react';

import type { IconComponent } from '../../components/icon-button';
import { fuzzyMatch, fuzzyMatchPath } from './fuzzy-match';

export type PaletteItem = {
  id: string;
  label: string;
  group: string;
  icon?: IconComponent;
  keywords?: string;
  detail?: string;
  chord?: string;
  disabled?: boolean;
  disabledReason?: string;
  run: () => void;
};

export type PaletteSourceKey =
  | 'commands'
  | 'views'
  | 'settings'
  | 'repos'
  | 'worktrees'
  | 'refs'
  | 'files'
  | 'sessions'
  | 'agents'
  | 'project-boards';

export type PaletteSource = {
  key: PaletteSourceKey;
  items: () => PaletteItem[];
};

/**
 * Source weight multipliers to ensure primary actions like commands
 * and views rank higher than broad resource listings when scores are close.
 */
export const SOURCE_WEIGHTS: Record<PaletteSourceKey, number> = {
  commands: 1.2,
  views: 1.1,
  settings: 1.05,
  repos: 1.0,
  worktrees: 0.95,
  refs: 1.0,
  files: 0.9,
  sessions: 0.9,
  agents: 1.0,
  'project-boards': 1.0,
};

export type ScoredPaletteItem = {
  item: PaletteItem;
  score: number;
  labelIndices: number[];
  detailIndices?: number[];
};

/**
 * Scores a palette item against a query needle.
 * Checks label first (using fuzzyMatchPath for file sources), then keywords and detail.
 */
export function scorePaletteItem(
  item: PaletteItem,
  needle: string,
  sourceKey: PaletteSourceKey,
): ScoredPaletteItem | null {
  if (!needle) {
    return {
      item,
      score: 0,
      labelIndices: [],
    };
  }

  const labelMatch =
    sourceKey === 'files' ? fuzzyMatchPath(needle, item.label) : fuzzyMatch(needle, item.label);
  let bestScore = labelMatch ? labelMatch.score : -1;
  const labelIndices = labelMatch ? labelMatch.indices : [];
  let detailIndices: number[] | undefined;

  // If keywords match, boost score
  if (item.keywords) {
    const kwMatch = fuzzyMatch(needle, item.keywords);
    if (kwMatch && kwMatch.score * 0.9 > bestScore) {
      bestScore = Math.max(bestScore, kwMatch.score * 0.9);
    }
  }

  // If detail matches
  if (item.detail) {
    const detailMatch = fuzzyMatch(needle, item.detail);
    if (detailMatch) {
      if (detailMatch.score * 0.7 > bestScore) {
        bestScore = Math.max(bestScore, detailMatch.score * 0.7);
      }
      detailIndices = detailMatch.indices;
    }
  }

  if (bestScore < 0) {
    return null;
  }

  const weight = SOURCE_WEIGHTS[sourceKey] ?? 1.0;
  return {
    item,
    score: bestScore * weight,
    labelIndices,
    detailIndices,
  };
}

/**
 * Highlights matched characters using <mark> tags with Tailwind styling.
 */
export function highlightMatches(text: string, indices: readonly number[]): ReactNode {
  if (!indices || indices.length === 0) {
    return text;
  }

  const indexSet = new Set(indices);
  const elements: ReactNode[] = [];
  let currentChunk = '';
  let isMarked = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i] ?? '';
    const match = indexSet.has(i);

    if (match === isMarked) {
      currentChunk += char;
    } else {
      if (currentChunk.length > 0) {
        if (isMarked) {
          elements.push(
            <mark
              key={i - currentChunk.length}
              className="bg-primary/20 text-foreground font-semibold rounded-xs px-0.5"
            >
              {currentChunk}
            </mark>,
          );
        } else {
          elements.push(currentChunk);
        }
      }
      currentChunk = char;
      isMarked = match;
    }
  }

  if (currentChunk.length > 0) {
    if (isMarked) {
      elements.push(
        <mark
          key={text.length - currentChunk.length}
          className="bg-primary/20 text-foreground font-semibold rounded-xs px-0.5"
        >
          {currentChunk}
        </mark>,
      );
    } else {
      elements.push(currentChunk);
    }
  }

  return elements;
}
