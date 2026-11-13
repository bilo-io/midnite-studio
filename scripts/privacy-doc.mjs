#!/usr/bin/env node
// Regenerates docs/PRIVACY.md from the egress registry (Phase 115 Theme G).
// The renderer is TypeScript in packages/shared, so this runs it through that package's own vitest rather
// than adding a TS loader: `privacy-doc.test.ts` writes the file when PRIVACY_DOC_WRITE=1 and otherwise
// checks it, which is what CI runs. `--check` runs the check only.
import { spawnSync } from 'node:child_process';

const check = process.argv.includes('--check');
const result = spawnSync('pnpm', ['-C', 'packages/shared', 'exec', 'vitest', 'run', 'src/privacy-doc.test.ts'], {
  stdio: 'inherit',
  env: { ...process.env, ...(check ? {} : { PRIVACY_DOC_WRITE: '1' }) },
});
process.exit(result.status ?? 1);
