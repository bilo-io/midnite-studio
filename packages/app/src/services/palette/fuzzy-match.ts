export type FuzzyMatchResult = {
  score: number;
  /** Matched character indices in the haystack, sorted in ascending order. */
  indices: number[];
};

/**
 * Hand-rolled subsequence fuzzy matcher.
 *
 * Designed for the command palette to score needles against labels/keywords
 * and produce character indices for `<mark>` highlighting.
 *
 * Scoring rules:
 * - Base match per character: +10
 * - Match at index 0 (prefix): +25
 * - Match at word boundary (after space, slash, dash, underscore, dot, colon): +15
 * - Consecutive match run bonus: +20 * consecutive_count
 * - Exact case match bonus: +2
 * - Distance penalty for gaps: -1 per character span gap
 */
export function fuzzyMatch(needle: string, haystack: string): FuzzyMatchResult | null {
  if (needle.length === 0) {
    return { score: 0, indices: [] };
  }

  if (needle.length > haystack.length) {
    return null;
  }

  const lowerNeedle = needle.toLowerCase();
  const lowerHaystack = haystack.toLowerCase();

  // Fast check: is lowerNeedle a subsequence of lowerHaystack?
  let nIdx = 0;
  for (let hIdx = 0; hIdx < lowerHaystack.length && nIdx < lowerNeedle.length; hIdx++) {
    if (lowerHaystack[hIdx] === lowerNeedle[nIdx]) {
      nIdx++;
    }
  }
  if (nIdx < lowerNeedle.length) {
    return null;
  }

  // Fast path for exact substring match:
  const subIdx = lowerHaystack.indexOf(lowerNeedle);
  let bestIndices: number[] | null = null;
  let bestScore = -Infinity;

  if (subIdx !== -1) {
    const indices: number[] = [];
    let score = 0;
    for (let i = 0; i < needle.length; i++) {
      const pos = subIdx + i;
      indices.push(pos);
      let charScore = 10;
      const isStart = pos === 0;
      const prevChar = pos > 0 ? haystack[pos - 1] : '';
      const isWordBoundary =
        isStart ||
        prevChar === ' ' ||
        prevChar === '/' ||
        prevChar === '-' ||
        prevChar === '_' ||
        prevChar === '.' ||
        prevChar === ':';

      if (isStart) charScore += 25;
      else if (isWordBoundary) charScore += 15;

      if (i > 0) charScore += 20; // consecutive match
      if (haystack[pos] === needle[i]) charScore += 2; // exact case

      score += charScore;
    }
    bestIndices = indices;
    bestScore = score;
  }

  // Also check candidate match sequences (e.g. acronyms or matches starting at word boundaries)
  function evaluateFrom(startPos: number): { score: number; indices: number[] } | null {
    const indices: number[] = [];
    let score = 0;
    let hayStart = startPos;

    for (let i = 0; i < needle.length; i++) {
      const nChar = lowerNeedle[i];
      let bestCharPos = -1;
      let bestCharScore = -Infinity;

      for (let pos = hayStart; pos <= lowerHaystack.length - (needle.length - i); pos++) {
        if (lowerHaystack[pos] === nChar) {
          let charScore = 10;
          const isStart = pos === 0;
          const prevChar = pos > 0 ? haystack[pos - 1] : '';
          const isWordBoundary =
            isStart ||
            prevChar === ' ' ||
            prevChar === '/' ||
            prevChar === '-' ||
            prevChar === '_' ||
            prevChar === '.' ||
            prevChar === ':';

          if (isStart) charScore += 25;
          else if (isWordBoundary) charScore += 15;

          const lastMatchedIdx = indices.length > 0 ? indices[indices.length - 1] : undefined;
          if (lastMatchedIdx !== undefined && lastMatchedIdx === pos - 1) {
            charScore += 20;
          }
          if (haystack[pos] === needle[i]) {
            charScore += 2;
          }

          if (isStart || isWordBoundary || (lastMatchedIdx !== undefined && lastMatchedIdx === pos - 1)) {
            bestCharPos = pos;
            bestCharScore = charScore;
            break;
          }

          if (charScore > bestCharScore) {
            bestCharPos = pos;
            bestCharScore = charScore;
          }
        }
      }

      if (bestCharPos === -1) return null;

      indices.push(bestCharPos);
      score += bestCharScore;

      if (indices.length > 1) {
        const prevIdx = indices[indices.length - 2];
        if (prevIdx !== undefined) {
          const gap = bestCharPos - prevIdx - 1;
          if (gap > 0) score -= Math.min(gap, 10);
        }
      }

      hayStart = bestCharPos + 1;
    }

    return { score, indices };
  }

  // Check matching candidates starting at each occurrence of needle[0]
  for (let pos = 0; pos < lowerHaystack.length; pos++) {
    if (lowerHaystack[pos] === lowerNeedle[0]) {
      const res = evaluateFrom(pos);
      if (res && res.score > bestScore) {
        bestScore = res.score;
        bestIndices = res.indices;
      }
    }
  }

  if (!bestIndices) return null;
  return { score: bestScore, indices: bestIndices };
}
