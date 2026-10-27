import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';

import type { SkillAuditFinding } from '@midnite/studio-shared';

import { exceedsThreshold, scoreInjection } from './injection-detector';

export type SkillAuditOptions = {
  scoreInjectionFn?: typeof scoreInjection;
  allowedHosts?: readonly string[];
};

const DEFAULT_ALLOWED_HOSTS = [
  'registry.npmjs.org',
  'github.com',
  'raw.githubusercontent.com',
  'api.github.com',
  'pypi.org',
  'files.pythonhosted.org',
  'crates.io',
  'static.crates.io',
  'rubygems.org',
];

const SCRIPT_EXTENSIONS = new Set(['.sh', '.bash', '.zsh', '.js', '.mjs', '.cjs', '.ts', '.py', '.rb']);

const NETWORK_CALL_REGEX = /\b(?:curl|wget|fetch|http\.get|urllib\.request|requests\.get|axios)\b[^\n]*/i;

/**
 * Check if a buffer starts with known binary executable magic signatures.
 */
function isBinaryExecutable(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;

  // ELF magic: 0x7F 'E' 'L' 'F'
  if (buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
    return true;
  }

  // Mach-O magic: 32-bit/64-bit and reverse endian, or fat binary
  const magic32 = buffer.readUInt32BE(0);
  if (
    magic32 === 0xfeedface ||
    magic32 === 0xfeedfacf ||
    magic32 === 0xcefaedfe ||
    magic32 === 0xcffaedfe ||
    magic32 === 0xcafebabe
  ) {
    return true;
  }

  // Windows PE: "MZ"
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return true;
  }

  // Check for presence of null bytes in the first 512 bytes (indicative of compiled binary)
  const probeLength = Math.min(buffer.length, 512);
  let nullCount = 0;
  for (let i = 0; i < probeLength; i++) {
    if (buffer[i] === 0) nullCount++;
  }
  return nullCount > 0;
}

/**
 * Audit a skill or plugin directory for prompt injection, suspicious network requests, or binaries.
 */
export async function auditSkillDirectory(
  skillDir: string,
  options: SkillAuditOptions = {},
): Promise<SkillAuditFinding[]> {
  const scorer = options.scoreInjectionFn ?? scoreInjection;
  const allowedHosts = options.allowedHosts ?? DEFAULT_ALLOWED_HOSTS;
  const findings: SkillAuditFinding[] = [];
  const skillName = basename(skillDir);

  const fileList: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '__pycache__') {
        continue;
      }
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        fileList.push(fullPath);
      }
    }
  }

  await walk(skillDir);

  for (const filePath of fileList) {
    const relPath = relative(skillDir, filePath);
    const fileName = basename(filePath);

    // 1. Theme A Injection detector over every SKILL.md (or markdown document)
    if (fileName.toLowerCase() === 'skill.md' || fileName.toLowerCase().endsWith('.md')) {
      try {
        const content = await readFile(filePath, 'utf8');
        const scan = scorer(content, { discountContext: false });
        if (exceedsThreshold(scan)) {
          findings.push({
            kind: 'prompt-injection',
            severity: 'high',
            skillPath: skillDir,
            skillName,
            message: `Prompt injection detected in ${relPath} (score ${(scan.score * 100).toFixed(0)}%)`,
            details: { file: relPath, score: scan.score, signals: scan.signals },
          });
        }
      } catch {
        // Unreadable file, skip
      }
    }

    // 2. Binary detection
    try {
      const fileStat = await stat(filePath);
      if (fileStat.size > 0) {
        const handle = await readFile(filePath);
        // Only inspect non-media files for binaries
        const isMedia = /\.(png|jpe?g|gif|webp|svg|ico|ogg|mp3|wav|mp4|webm|woff2?|ttf|eot)$/i.test(fileName);
        if (!isMedia && isBinaryExecutable(handle)) {
          findings.push({
            kind: 'binary-file',
            severity: 'high',
            skillPath: skillDir,
            skillName,
            message: `Compiled binary or executable found in skill: "${relPath}"`,
            details: { file: relPath, size: fileStat.size },
          });
          continue; // Binary files shouldn't be parsed for text network calls
        }
      }
    } catch {
      // stat/read error, skip
    }

    // 3. Network calls to non-registry hosts in scripts
    const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
    if (SCRIPT_EXTENSIONS.has(ext)) {
      try {
        const text = await readFile(filePath, 'utf8');
        const lines = text.split('\n');
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
          const line = lines[lineIndex]!;
          const match = line.match(NETWORK_CALL_REGEX);
          if (match) {
            const raw = match[0];
            // Check if it targets an external host
            const urlMatch = raw.match(/https?:\/\/([^/\s"':]+)/i);
            if (urlMatch && urlMatch[1]) {
              const host = urlMatch[1].toLowerCase();
              const isAllowed = allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
              if (!isAllowed) {
                findings.push({
                  kind: 'suspicious-network',
                  severity: 'high',
                  skillPath: skillDir,
                  skillName,
                  message: `Suspicious network call to untrusted host "${host}" in ${relPath}:${lineIndex + 1}`,
                  details: { file: relPath, line: lineIndex + 1, host, command: line.trim() },
                });
              }
            } else if (/\bcurl\b|\bwget\b/i.test(raw) && !raw.includes('$') && !raw.includes('#')) {
              // Raw curl/wget without known safe host
              findings.push({
                kind: 'suspicious-network',
                severity: 'medium',
                skillPath: skillDir,
                skillName,
                message: `Outbound network command in ${relPath}:${lineIndex + 1}: ${raw.slice(0, 80).trim()}`,
                details: { file: relPath, line: lineIndex + 1, command: line.trim() },
              });
            }
          }
        }
      } catch {
        // Skip unreadable script
      }
    }
  }

  return findings;
}
