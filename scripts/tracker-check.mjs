#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/**
 * Checks if a checklist item line is marked as deferred or out of scope.
 * @param {string} text
 * @returns {boolean}
 */
export function isExcludedItem(text) {
  return (
    /^(?:[\[(]?\s*(?:⏳|❌)|\*{1,2}(?:⏳|❌))/u.test(text) ||
    /^(?:⏳\s*deferred|❌\s*OUT OF SCOPE)/iu.test(text) ||
    /(?:[\[(]\s*(?:⏳\s*deferred|❌\s*OUT OF SCOPE)\s*[\])])$/iu.test(text)
  );
}

/**
 * Parses a phase document markdown content.
 * @param {string} content
 * @returns {{
 *   doneCount: number,
 *   openCount: number,
 *   totalCount: number,
 *   themes: string[],
 *   duplicateThemes: string[],
 *   refined: string | null
 * }}
 */
export function parsePhaseDoc(content) {
  const lines = content.split('\n');
  let doneCount = 0;
  let openCount = 0;
  const themes = [];
  const seenThemes = new Set();
  const duplicateThemes = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Check for theme headings: ### A — or ### Theme A — or ## Theme A —
    const themeMatch = line.match(/^#{2,3}\s+(?:Theme\s+)?([A-Z])\s*[-—]/u);
    if (themeMatch) {
      const letter = themeMatch[1].toUpperCase();
      themes.push(letter);
      if (seenThemes.has(letter)) {
        if (!duplicateThemes.includes(letter)) {
          duplicateThemes.push(letter);
        }
      }
      seenThemes.add(letter);
    }

    // Check for checklist items: - [x] or - [ ]
    const boxMatch = trimmed.match(/^-\s*\[([xX\s])\]\s*(.*)$/);
    if (boxMatch) {
      const isChecked = boxMatch[1].toLowerCase() === 'x';
      const itemText = boxMatch[2].trim();
      if (!isExcludedItem(itemText)) {
        if (isChecked) {
          doneCount++;
        } else {
          openCount++;
        }
      }
    }
  }

  // Refined stamp check: **Refined: xN** or Refined: xN
  const refinedMatch = content.match(/\*{0,2}Refined:\s*(x\d+)\*{0,2}/i);
  const refined = refinedMatch ? refinedMatch[1].toLowerCase() : null;

  return {
    doneCount,
    openCount,
    totalCount: doneCount + openCount,
    themes,
    duplicateThemes,
    refined,
  };
}

/**
 * Computes progress bar and percentage string from done/total.
 * @param {number} done
 * @param {number} total
 * @returns {{ bar: string, pctStr: string }}
 */
export function computeProgress(done, total) {
  if (total <= 0) {
    return {
      bar: '`░░░░░░░░░░`',
      pctStr: '—',
    };
  }
  const pct = Math.round((done / total) * 100);
  const filled = Math.round((done / total) * 10);
  const bar = '`' + '█'.repeat(filled) + '░'.repeat(10 - filled) + '`';
  return {
    bar,
    pctStr: `${pct}%`,
  };
}

/**
 * Parses _INDEX.md content for phase rows and theme key entries.
 * @param {string} content
 * @returns {{
 *   phases: Map<number, {
 *     lineIndex: number,
 *     rawLine: string,
 *     num: number,
 *     title: string,
 *     path: string,
 *     status: string,
 *     refined: string,
 *     doneStr: string,
 *     bar: string,
 *     pctStr: string,
 *     wip: string,
 *     todo: string
 *   }>,
 *   themeKeys: Map<number, string[]>
 * }}
 */
export function parseIndex(content) {
  const lines = content.split('\n');
  const phases = new Map();
  const themeKeys = new Map();

  const phasesIndex = lines.findIndex((l) => /^##\s+Phases\b/i.test(l));
  const themeKeyIndex = lines.findIndex((l) => /^##\s+Theme\s+key\b/i.test(l));

  if (phasesIndex !== -1) {
    const end = themeKeyIndex !== -1 ? themeKeyIndex : lines.length;
    for (let i = phasesIndex + 1; i < end; i++) {
      const line = lines[i];
      const m = line.match(
        /^\|\s*\[(\d+)\s*[·-]\s*([^\]]+)\]\(([^)]+)\)\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/
      );
      if (m) {
        const num = parseInt(m[1], 10);
        phases.set(num, {
          lineIndex: i,
          rawLine: line,
          num,
          title: m[2].trim(),
          path: m[3].trim(),
          status: m[4].trim(),
          refined: m[5].trim(),
          doneStr: m[6].trim(),
          bar: m[7].trim(),
          pctStr: m[8].trim(),
          wip: m[9].trim(),
          todo: m[10].trim(),
        });
      }
    }
  }

  if (themeKeyIndex !== -1) {
    let curPhase = null;
    for (let i = themeKeyIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      const pm = line.match(/^###\s+\[?Phase\s+(\d+)/i);
      if (pm) {
        curPhase = parseInt(pm[1], 10);
        if (!themeKeys.has(curPhase)) {
          themeKeys.set(curPhase, []);
        }
        continue;
      }
      if (curPhase !== null) {
        if (/^##\s+/.test(line)) {
          curPhase = null;
          continue;
        }
        const tm = line.match(
          /^-\s*(?:[◻✅🔄◐]|⏳|❌)\s*\*\*(?:Theme\s+)?([A-Z])\*\*/iu
        );
        if (tm) {
          themeKeys.get(curPhase).push(tm[1].toUpperCase());
        }
      }
    }
  }

  return { phases, themeKeys };
}

/**
 * Checks equality of two arrays as unordered sets.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {boolean}
 */
export function areSetsEqual(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const x of sa) {
    if (!sb.has(x)) return false;
  }
  return true;
}

/**
 * Runs all tracker consistency checks.
 * @param {{
 *   tasksDir?: string,
 *   indexContent?: string,
 *   docFiles?: Map<string, string>
 * }} [params]
 * @returns {{
 *   violations: Array<{
 *     phase: number,
 *     rule: number,
 *     ruleName: string,
 *     expected: string,
 *     actual: string,
 *     message: string
 *   }>,
 *   warnings: Array<{
 *     phase: number,
 *     message: string
 *   }>
 * }}
 */
export function runTrackerChecks(params = {}) {
  const tasksDir = params.tasksDir ?? path.join(process.cwd(), '.midnite/tasks');
  const indexContent =
    params.indexContent ??
    fs.readFileSync(path.join(tasksDir, '_INDEX.md'), 'utf8');

  const { phases: indexPhases, themeKeys } = parseIndex(indexContent);

  // Discover doc files on disk or in mock map
  const docFileEntries = [];
  if (params.docFiles) {
    for (const [relPath, content] of params.docFiles.entries()) {
      docFileEntries.push({ relPath, content });
    }
  } else {
    const phasesDir = path.join(tasksDir, 'phases');
    if (fs.existsSync(phasesDir)) {
      const files = fs
        .readdirSync(phasesDir)
        .filter((f) => f.startsWith('phase-') && f.endsWith('.md'));
      for (const f of files) {
        const full = path.join(phasesDir, f);
        docFileEntries.push({
          relPath: path.join('phases', f),
          content: fs.readFileSync(full, 'utf8'),
        });
      }
    }
  }

  const docPhases = new Map();
  for (const entry of docFileEntries) {
    const base = path.basename(entry.relPath);
    const m = base.match(/^phase-(\d+)-/);
    if (m) {
      const num = parseInt(m[1], 10);
      docPhases.set(num, entry);
    }
  }

  const violations = [];
  const warnings = [];

  // Rule 1: Every phase doc has an index row
  for (const [num, entry] of docPhases.entries()) {
    if (!indexPhases.has(num)) {
      violations.push({
        phase: num,
        rule: 1,
        ruleName: 'presence-in-index',
        expected: `row for phase ${num} in _INDEX.md`,
        actual: 'row missing',
        message: `phase ${num}: rule 1 (presence-in-index) — row for phase ${num} in _INDEX.md vs row missing`,
      });
    }
  }

  // Rule 2: Every index row has a phase doc
  for (const [num, row] of indexPhases.entries()) {
    const hasDoc = params.docFiles
      ? params.docFiles.has(row.path)
      : fs.existsSync(path.join(tasksDir, row.path));
    if (!hasDoc) {
      violations.push({
        phase: num,
        rule: 2,
        ruleName: 'doc-exists',
        expected: `phase doc file at ${row.path}`,
        actual: 'file missing',
        message: `phase ${num}: rule 2 (doc-exists) — phase doc file at ${row.path} vs file missing`,
      });
    }
  }

  // Evaluate rules 3 to 7 for all phases present in both
  for (const [num, row] of indexPhases.entries()) {
    const docEntry = docPhases.get(num);
    if (!docEntry) continue;

    const parsedDoc = parsePhaseDoc(docEntry.content);

    // Rule 3: Counts agree
    const expectedCounts = `${parsedDoc.doneCount}/${parsedDoc.totalCount}`;
    if (row.doneStr !== expectedCounts) {
      violations.push({
        phase: num,
        rule: 3,
        ruleName: 'counts',
        expected: `${expectedCounts} (from doc)`,
        actual: `${row.doneStr} (in index)`,
        message: `phase ${num}: rule 3 (counts) — ${expectedCounts} (from doc) vs ${row.doneStr} (in index)`,
      });
    }

    // Rule 4: No duplicate theme letters in doc
    if (parsedDoc.duplicateThemes.length > 0) {
      violations.push({
        phase: num,
        rule: 4,
        ruleName: 'duplicate-themes',
        expected: 'no duplicate theme letters in doc',
        actual: `duplicate theme letters: ${parsedDoc.duplicateThemes.join(', ')}`,
        message: `phase ${num}: rule 4 (duplicate-themes) — no duplicate theme letters in doc vs duplicate theme letters: ${parsedDoc.duplicateThemes.join(', ')}`,
      });
    }

    // Rule 5: Theme letters agree
    const docThemeSet =
      parsedDoc.themes.length > 0 ? parsedDoc.themes : ['A'];
    const keyThemeSet = themeKeys.get(num) ?? ['A'];
    if (!areSetsEqual(docThemeSet, keyThemeSet)) {
      violations.push({
        phase: num,
        rule: 5,
        ruleName: 'theme-letters',
        expected: `[${[...new Set(docThemeSet)].sort().join(',')}] (from doc)`,
        actual: `[${[...new Set(keyThemeSet)].sort().join(',')}] (in theme key)`,
        message: `phase ${num}: rule 5 (theme-letters) — [${[...new Set(docThemeSet)].sort().join(',')}] (from doc) vs [${[...new Set(keyThemeSet)].sort().join(',')}] (in theme key)`,
      });
    }

    // Rule 6: Refined stamp matches
    const expectedRefined = parsedDoc.refined ?? '—';
    if (row.refined !== expectedRefined) {
      violations.push({
        phase: num,
        rule: 6,
        ruleName: 'refined-stamp',
        expected: `${expectedRefined} (from doc)`,
        actual: `${row.refined} (in index)`,
        message: `phase ${num}: rule 6 (refined-stamp) — ${expectedRefined} (from doc) vs ${row.refined} (in index)`,
      });
    }

    // Rule 7: Progress bar and % match counts
    const { bar: expectedBar, pctStr: expectedPct } = computeProgress(
      parsedDoc.doneCount,
      parsedDoc.totalCount
    );
    if (row.bar !== expectedBar || row.pctStr !== expectedPct) {
      violations.push({
        phase: num,
        rule: 7,
        ruleName: 'progress-bar-and-percent',
        expected: `(${expectedBar}, ${expectedPct})`,
        actual: `(${row.bar}, ${row.pctStr})`,
        message: `phase ${num}: rule 7 (progress-bar-and-percent) — (${expectedBar}, ${expectedPct}) vs (${row.bar}, ${row.pctStr})`,
      });
    }

    // Warning: WIP status with empty WIP column
    if (row.status === '🔄 WIP' && (row.wip === '—' || row.wip === '')) {
      warnings.push({
        phase: num,
        message: `phase ${num}: warning — status is 🔄 WIP but WIP column is empty ('${row.wip}')`,
      });
    }
  }

  // Sort violations by phase number ascending, then rule number
  violations.sort((a, b) => a.phase - b.phase || a.rule - b.rule);

  return { violations, warnings };
}

/**
 * Applies --fix for arithmetic rules (3 and 7) on _INDEX.md content.
 * Also flips ✅ DONE to 🔄 WIP if done < total.
 * @param {string} indexContent
 * @param {Map<number, { content: string, path: string }>} docPhases
 * @returns {{
 *   content: string,
 *   fixedPhases: number[]
 * }}
 */
export function fixTrackerIndex(indexContent, docPhases) {
  const lines = indexContent.split('\n');
  const { phases } = parseIndex(indexContent);
  const fixedPhases = [];

  for (const [num, row] of phases.entries()) {
    const docEntry = docPhases.get(num);
    if (!docEntry) continue;

    const parsedDoc = parsePhaseDoc(docEntry.content);
    const expectedDoneStr = `${parsedDoc.doneCount}/${parsedDoc.totalCount}`;
    const { bar: expectedBar, pctStr: expectedPct } = computeProgress(
      parsedDoc.doneCount,
      parsedDoc.totalCount
    );

    let status = row.status;
    if (status === '✅ DONE' && parsedDoc.doneCount < parsedDoc.totalCount) {
      status = '🔄 WIP';
    }

    if (
      row.doneStr !== expectedDoneStr ||
      row.bar !== expectedBar ||
      row.pctStr !== expectedPct ||
      row.status !== status
    ) {
      const updatedLine = `| [${row.num} · ${row.title}](${row.path}) | ${status} | ${row.refined} | ${expectedDoneStr} | ${expectedBar} | ${expectedPct} | ${row.wip} | ${row.todo} |`;
      lines[row.lineIndex] = updatedLine;
      fixedPhases.push(num);
    }
  }

  return {
    content: lines.join('\n'),
    fixedPhases,
  };
}

/**
 * CLI runner.
 */
function main() {
  const args = process.argv.slice(2);
  const isFix = args.includes('--fix');
  const tasksDir = path.join(process.cwd(), '.midnite/tasks');
  const indexPath = path.join(tasksDir, '_INDEX.md');

  if (!fs.existsSync(indexPath)) {
    console.error(`Error: _INDEX.md not found at ${indexPath}`);
    process.exit(1);
  }

  if (isFix) {
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    const phasesDir = path.join(tasksDir, 'phases');
    const docPhases = new Map();
    if (fs.existsSync(phasesDir)) {
      const files = fs
        .readdirSync(phasesDir)
        .filter((f) => f.startsWith('phase-') && f.endsWith('.md'));
      for (const f of files) {
        const full = path.join(phasesDir, f);
        const m = f.match(/^phase-(\d+)-/);
        if (m) {
          docPhases.set(parseInt(m[1], 10), {
            path: path.join('phases', f),
            content: fs.readFileSync(full, 'utf8'),
          });
        }
      }
    }

    const { content: fixedContent, fixedPhases } = fixTrackerIndex(
      indexContent,
      docPhases
    );
    if (fixedPhases.length > 0) {
      fs.writeFileSync(indexPath, fixedContent, 'utf8');
      console.log(
        `--fix: updated arithmetic and status for ${fixedPhases.length} phase(s): ${fixedPhases.join(', ')}`
      );
    } else {
      console.log('--fix: no arithmetic discrepancies found.');
    }
  }

  const { violations, warnings } = runTrackerChecks({ tasksDir });

  for (const warning of warnings) {
    console.warn(warning.message);
  }

  if (violations.length > 0) {
    for (const v of violations) {
      console.error(v.message);
    }
    const distinctPhases = new Set(violations.map((v) => v.phase)).size;
    console.error(
      `\nFailure: ${violations.length} violation(s) across ${distinctPhases} phase(s).`
    );
    process.exit(1);
  }

  console.log('Success: All phase docs and index rows agree.');
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main();
}
