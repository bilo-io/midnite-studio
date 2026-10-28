import type {
  InstallCandidate,
  PackageCheckFinding,
  PackageCheckSeverity,
  PackageEcosystem,
} from '@midnite/studio-shared';

/**
 * Seven days in milliseconds — the slopsquatting / brand-new package observation window.
 */
export const REGISTRY_AGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Standard Levenshtein edit distance between two strings.
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(
        dp[j]! + 1, // deletion
        dp[j - 1]! + 1, // insertion
        prev + cost, // substitution
      );
      prev = temp;
    }
  }
  return dp[b.length]!;
}

/**
 * Top representative registry packages across ecosystems against which typosquats are detected.
 */
export const DEFAULT_TOP_PACKAGES: Record<PackageEcosystem, readonly string[]> = {
  npm: [
    'lodash', 'express', 'react', 'react-dom', 'axios', 'chalk', 'commander',
    'vue', 'next', 'typescript', 'webpack', 'tslib', 'glob', 'debug', 'rxjs',
    'dotenv', 'postcss', 'fs-extra', 'moment', 'request', 'yargs', 'core-js',
    'semver', 'uuid', 'prettier', 'eslint', 'vitest', 'jest', 'vite', 'esbuild',
    'babel', 'cheerio', 'inquirer', 'async', 'minimist', 'mkdirp', 'rimraf',
    'body-parser', 'cors', 'winston', 'nodemon', 'mongoose', 'prisma', 'ws',
    'socket.io', 'zod', 'styled-components', 'redux', 'tailwindcss',
  ],
  pypi: [
    'requests', 'numpy', 'pandas', 'flask', 'django', 'urllib3', 'boto3',
    'six', 'pytest', 'pip', 'wheel', 'setuptools', 'certifi', 'idna',
    'pyyaml', 'scipy', 'cryptography', 'pydantic', 'fastapi', 'scikit-learn',
    'matplotlib', 'aiohttp', 'torch', 'tensorflow', 'black', 'ruff',
  ],
  cargo: [
    'serde', 'tokio', 'syn', 'rand', 'quote', 'regex', 'libc', 'clap',
    'anyhow', 'thiserror', 'log', 'futures', 'lazy_static', 'itertools',
    'bitflags', 'chrono', 'tracing', 'reqwest', 'hyper', 'crossbeam',
  ],
  rubygems: [
    'rails', 'rake', 'rspec', 'bundler', 'json', 'activesupport', 'devise',
    'nokogiri', 'sidekiq', 'puma', 'pg', 'redis', 'faraday', 'rack',
  ],
  homebrew: [
    'git', 'node', 'python', 'ripgrep', 'openssl', 'curl', 'wget', 'ffmpeg',
    'gh', 'cmake', 'pnpm', 'go', 'rust', 'docker', 'kubectl',
  ],
  go: [
    'github.com/gin-gonic/gin', 'github.com/stretchr/testify',
    'github.com/spf13/cobra', 'golang.org/x/crypto', 'github.com/sirupsen/logrus',
    'google.golang.org/grpc', 'go.uber.org/zap', 'github.com/google/uuid',
  ],
};

/**
 * Known poisoned package versions (e.g. supply chain attacks / malware drops).
 */
export const KNOWN_POISONED_VERSIONS: ReadonlySet<string> = new Set([
  'event-stream:3.3.6',
  'flatmap-stream:0.1.1',
  'ua-parser-js:0.7.29',
  'ua-parser-js:0.8.0',
  'ua-parser-js:1.0.0',
  'coa:2.0.3',
  'coa:2.0.4',
  'rc:1.2.9',
  'rc:1.3.9',
  'colors:1.4.1',
  'colors:1.4.2',
  'faker:6.6.6',
]);

const SENSITIVE_SCRIPT_PATTERNS = [
  /\b(?:cat|read|source|\.|\$)\s+.*(?:\.npmrc|\.git\/config|id_rsa|\.aws|\.env)\b/i,
  /\b(?:\.npmrc|\.git\/config|\/etc\/passwd|id_rsa)\b/i,
  /\bprocess\.env\b|\bprintenv\b|\benv\b/i,
  /\b(?:curl|wget|fetch|nc|bash\s+-i)\b/i,
];

/**
 * Check if package name is a typosquat of a high-profile package (edit distance 1 or 2).
 */
export function checkTyposquat(
  candidate: InstallCandidate,
  topPackages: readonly string[] = DEFAULT_TOP_PACKAGES[candidate.ecosystem] ?? [],
): PackageCheckFinding | null {
  const target = candidate.name.toLowerCase();
  // Strip npm scope for bare name check, e.g. @attacker/lodash -> lodash
  const baseName = target.startsWith('@') ? (target.split('/')[1] ?? target) : target;

  for (const top of topPackages) {
    const topLower = top.toLowerCase();
    if (baseName === topLower || target === topLower) {
      // Exact match to legitimate package name -> NOT a typosquat
      continue;
    }

    const dist = editDistance(baseName, topLower);
    if (dist > 0 && dist <= 2 && Math.abs(baseName.length - topLower.length) <= 2) {
      return {
        kind: 'typosquat',
        severity: 'high',
        candidate,
        message: `Package "${candidate.name}" is a potential typosquat of popular package "${top}" (edit distance ${dist})`,
        details: { target: candidate.name, topPackage: top, editDistance: dist },
      };
    }
  }

  return null;
}

/**
 * Check if the package or version was published fewer than 7 days ago.
 */
export function checkRegistryAge(
  candidate: InstallCandidate,
  publishedAt: number | string | Date,
  now = Date.now(),
): PackageCheckFinding | null {
  const publishedMs = typeof publishedAt === 'number'
    ? publishedAt
    : new Date(publishedAt).getTime();

  if (Number.isNaN(publishedMs)) return null;

  const ageMs = now - publishedMs;
  if (ageMs >= 0 && ageMs < REGISTRY_AGE_WINDOW_MS) {
    const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
    const hours = Math.floor((ageMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    return {
      kind: 'registry-age',
      severity: 'medium',
      candidate,
      message: `Package "${candidate.name}" was published ${days}d ${hours}h ago (within 7-day observation window)`,
      details: { publishedAt: publishedMs, ageDays: days },
    };
  }

  return null;
}

/**
 * Check if the package manifest defines install/postinstall lifecycle scripts,
 * and if those scripts inspect sensitive tokens/files or make network calls.
 */
export function checkInstallScripts(
  candidate: InstallCandidate,
  scripts?: Record<string, string>,
): PackageCheckFinding[] {
  if (!scripts || typeof scripts !== 'object') return [];

  const findings: PackageCheckFinding[] = [];
  const lifecycleKeys = ['preinstall', 'install', 'postinstall'] as const;

  for (const key of lifecycleKeys) {
    const scriptContent = scripts[key];
    if (typeof scriptContent !== 'string') continue;

    const trimmed = scriptContent.trim();
    if (!trimmed) continue;

    const isSuspicious = SENSITIVE_SCRIPT_PATTERNS.some((pattern) => pattern.test(trimmed));
    if (isSuspicious) {
      findings.push({
        kind: 'suspicious-script',
        severity: 'high',
        candidate,
        message: `Package "${candidate.name}" ${key} script accesses sensitive config, environment, or network: "${trimmed.slice(0, 100)}"`,
        details: { scriptName: key, scriptContent: trimmed },
      });
    } else {
      findings.push({
        kind: 'install-script',
        severity: 'medium',
        candidate,
        message: `Package "${candidate.name}" defines a ${key} lifecycle script: "${trimmed.slice(0, 100)}"`,
        details: { scriptName: key, scriptContent: trimmed },
      });
    }
  }

  return findings;
}

/**
 * Check if package matches known poisoned versions.
 */
export function checkPoisonedVersion(
  candidate: InstallCandidate,
  poisonedSet: ReadonlySet<string> = KNOWN_POISONED_VERSIONS,
): PackageCheckFinding | null {
  const version = candidate.version?.replace(/^[=v^~]/, '');
  if (!version) return null;

  const key = `${candidate.name}:${version}`;
  if (poisonedSet.has(key)) {
    return {
      kind: 'poisoned-version',
      severity: 'critical',
      candidate,
      message: `Package "${candidate.name}@${candidate.version}" is on the known poisoned/malicious versions list`,
      details: { key },
    };
  }

  return null;
}

export type OsvAdvisory = {
  id: string;
  severity: PackageCheckSeverity;
  summary: string;
};

export type PackageMetadata = {
  publishedAt?: number | string | Date;
  scripts?: Record<string, string>;
  advisories?: readonly OsvAdvisory[];
};

export type PackageCheckOptions = {
  topPackages?: readonly string[];
  poisonedVersions?: ReadonlySet<string>;
  now?: number;
};

/**
 * Run all security checks on an install candidate given its metadata.
 */
export function checkPackageCandidate(
  candidate: InstallCandidate,
  metadata: PackageMetadata,
  options: PackageCheckOptions = {},
): PackageCheckFinding[] {
  const findings: PackageCheckFinding[] = [];

  // 1. Poisoned version check (critical)
  const poisoned = checkPoisonedVersion(candidate, options.poisonedVersions);
  if (poisoned) findings.push(poisoned);

  // 2. Typosquat check (high)
  const typosquat = checkTyposquat(candidate, options.topPackages);
  if (typosquat) findings.push(typosquat);

  // 3. Install scripts check (medium or high)
  if (metadata.scripts) {
    findings.push(...checkInstallScripts(candidate, metadata.scripts));
  }

  // 4. Registry age check (medium)
  if (metadata.publishedAt) {
    const ageFinding = checkRegistryAge(candidate, metadata.publishedAt, options.now);
    if (ageFinding) findings.push(ageFinding);
  }

  // 5. OSV advisories
  if (metadata.advisories && metadata.advisories.length > 0) {
    for (const adv of metadata.advisories) {
      findings.push({
        kind: 'osv-advisory',
        severity: adv.severity,
        candidate,
        message: `Package "${candidate.name}" has advisory ${adv.id}: ${adv.summary}`,
        details: { advisoryId: adv.id, summary: adv.summary },
      });
    }
  }

  return findings;
}
