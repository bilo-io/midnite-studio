#!/usr/bin/env node
// website-sync-install: keep packages/website/public/install.sh (launcher) and
// install-studio.sh identical to the upstream installers in the PUBLIC bilo-io/midnite-apps repo.
//
// The download page tells visitors to pipe the *site's* copy into `sh`
// (src/pages/download-page.tsx), which is shorter and served from the host they
// are already looking at — but a committed copy of someone else's file drifts,
// and the way it drifts here is the worst kind: silently, into an installer that
// keeps working while installing the wrong thing. So the copy is checked rather
// than trusted.
//
//   node scripts/website-sync-install.mjs --check   # exit 1 + a diff if they differ
//   node scripts/website-sync-install.mjs --write   # overwrite the local copy
//
// `--check` runs in .github/workflows/website.yml's build job. That job runs on
// pushes to `main`, i.e. AFTER a merge, so this is a loud alarm rather than a
// gate — which is the right shape: upstream can change with nothing merged here
// at all, so there is no pull request for a gate to block.
//
// Deliberately not a vitest. A test that reaches the network fails on a plane,
// fails in a sandbox, and turns an upstream outage into a red repo-wide gate.
//
// No dependencies, and no @midnite/* imports: it must run from a bare checkout.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const RAW = 'https://raw.githubusercontent.com/bilo-io/midnite-apps/main';

/**
 * The site's copies, each served at `<origin>/<file>` by any static host. Upstream is public, so no
 * credential is involved. `install.sh` is the LAUNCHER's installer (what the download page pipes
 * into sh); `install-studio.sh` is Studio's, kept for the app's own "Update Midnite Studio".
 */
const TARGETS = [
  { upstream: `${RAW}/midnite-launcher/install.sh`, label: 'packages/website/public/install.sh' },
  { upstream: `${RAW}/midnite-studio/install.sh`, label: 'packages/website/public/install-studio.sh' },
].map((t) => ({ ...t, local: path.join(repoRoot, t.label) }));

/**
 * A minimal unified diff — enough to see *what* changed in a CI log.
 *
 * Written here rather than shelled out to `diff` because the script has to run
 * on whatever the runner provides, and because the only interesting case is a
 * short edit to a 150-line file. The algorithm is a plain LCS over lines: at
 * this size its O(n·m) table is a rounding error, and it produces a real diff
 * rather than the "everything after line 12 changed" that a naive walk gives.
 *
 * @param {string} before
 * @param {string} after
 * @returns {string}
 */
function unifiedDiff(before, after, label, upstreamUrl) {
  const a = before.split('\n');
  const b = after.split('\n');

  // lcs[i][j] = length of the longest common subsequence of a[i:] and b[j:].
  const lcs = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  /** @type {{ sign: ' ' | '-' | '+', text: string }[]} */
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ sign: ' ', text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      ops.push({ sign: '-', text: a[i] });
      i++;
    } else {
      ops.push({ sign: '+', text: b[j] });
      j++;
    }
  }
  for (; i < a.length; i++) ops.push({ sign: '-', text: a[i] });
  for (; j < b.length; j++) ops.push({ sign: '+', text: b[j] });

  // Three lines of context around each run of changes, so a one-line edit
  // prints four lines instead of the whole file.
  const CONTEXT = 3;
  const keep = new Array(ops.length).fill(false);
  ops.forEach((op, index) => {
    if (op.sign === ' ') return;
    for (let k = Math.max(0, index - CONTEXT); k <= Math.min(ops.length - 1, index + CONTEXT); k++) {
      keep[k] = true;
    }
  });

  const lines = [`--- ${label}`, `+++ ${upstreamUrl}`];
  let elided = false;
  ops.forEach((op, index) => {
    if (!keep[index]) {
      if (!elided) lines.push('@@ …');
      elided = true;
      return;
    }
    elided = false;
    lines.push(`${op.sign}${op.text}`);
  });
  return lines.join('\n');
}

/**
 * Fetch the upstream script as text.
 *
 * Any non-200 is fatal: this script's whole job is to compare against upstream,
 * so "could not reach upstream" must not be reported as "in sync".
 *
 * @returns {Promise<string>}
 */
async function fetchUpstream(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`${url} responded ${response.status} ${response.statusText}`);
  }
  return response.text();
}

/** @param {string} file @returns {Promise<string>} */
async function readLocal(file) {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return '';
  }
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');

  if (write && args.includes('--check')) {
    console.error('website-sync-install: pass --check or --write, not both.');
    process.exit(2);
  }

  let drifted = false;
  for (const { upstream: url, label, local: file } of TARGETS) {
    const upstream = await fetchUpstream(url);
    const local = await readLocal(file);

    if (upstream === local) {
      console.log(`website-sync-install: ${label} matches upstream.`);
    } else if (write) {
      await writeFile(file, upstream, { mode: 0o755 });
      console.log(`website-sync-install: wrote ${label} from upstream.`);
    } else {
      drifted = true;
      console.error(`website-sync-install: ${label} has DRIFTED from upstream.\n`);
      console.error(unifiedDiff(local, upstream, label, url));
    }
  }

  if (drifted) {
    console.error(
      '\nRe-sync with:  node scripts/website-sync-install.mjs --write\n' +
        'Then check the download page still describes what the script does\n' +
        '(the numbered steps in src/pages/download-page.tsx are read off it).',
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`website-sync-install: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
