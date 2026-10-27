#!/usr/bin/env node
// Validates a candidate threat-feed.json (Phase 122 Theme C) before it is published from the midnite-apps repo.
// Standalone on purpose: no workspace imports, so it can be copied into that repo's workflow.
//   node scripts/threat-feed-check.mjs <feed.json> [--sig <file> --key <public-key.pem>]
import { createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'info']);
const isUrl = (s) => {
  try {
    return new URL(s).protocol === 'https:';
  } catch {
    return false;
  }
};

export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

/** Returns a list of problems; empty means the candidate is publishable. */
export function validateFeed(feed) {
  const problems = [];
  if (feed === null || typeof feed !== 'object' || Array.isArray(feed)) return ['the feed must be a JSON object'];
  if (!Number.isInteger(feed.version) || feed.version < 1) problems.push('version must be a positive integer');
  if (typeof feed.publishedAt !== 'string' || !feed.publishedAt) problems.push('publishedAt is required');
  const list = (key) => (Array.isArray(feed[key]) ? feed[key] : feed[key] === undefined ? [] : (problems.push(`${key} must be an array`), []));
  const needRef = (key, i, e) => {
    if (typeof e?.ref !== 'string' || !isUrl(e.ref)) problems.push(`${key}[${i}].ref must be an https URL`);
  };
  list('poisonedPackages').forEach((e, i) => {
    if (!e?.ecosystem || !e?.name || !e?.campaign) problems.push(`poisonedPackages[${i}] needs ecosystem, name and campaign`);
    if (!Array.isArray(e?.versions) || e.versions.length === 0) problems.push(`poisonedPackages[${i}].versions must be a non-empty array`);
    needRef('poisonedPackages', i, e);
  });
  list('mcpServers').forEach((e, i) => {
    if (!e?.nameOrUrl || !e?.campaign) problems.push(`mcpServers[${i}] needs nameOrUrl and campaign`);
    needRef('mcpServers', i, e);
  });
  list('slopsquatNames').forEach((e, i) => {
    if (!e?.ecosystem || !e?.name) problems.push(`slopsquatNames[${i}] needs ecosystem and name`);
    needRef('slopsquatNames', i, e);
  });
  list('clickfixDomains').forEach((d, i) => {
    if (typeof d !== 'string' || !d || d.includes('/')) problems.push(`clickfixDomains[${i}] must be a bare domain`);
  });
  list('commandGrammars').forEach((e, i) => {
    if (!e?.id) problems.push(`commandGrammars[${i}].id is required`);
    if (!SEVERITIES.has(e?.severity)) problems.push(`commandGrammars[${i}].severity is not a severity`);
    try {
      new RegExp(e?.regex);
    } catch {
      problems.push(`commandGrammars[${i}].regex does not compile`);
    }
    needRef('commandGrammars', i, e);
  });
  list('yaraRules').forEach((e, i) => {
    if (!e?.id || !/^[0-9a-f]{64}$/.test(e?.sha256 ?? '') || !isUrl(e?.url ?? '')) problems.push(`yaraRules[${i}] needs id, a sha256 and an https url`);
  });
  return problems;
}

export function verifySignature(feed, signatureBase64, publicKeyPem) {
  return verify(null, Buffer.from(canonicalJson(feed), 'utf8'), createPublicKey(publicKeyPem), Buffer.from(signatureBase64.trim(), 'base64'));
}

function main(argv) {
  const [file, ...rest] = argv;
  if (!file) {
    console.error('usage: threat-feed-check.mjs <feed.json> [--sig <file> --key <pem>]');
    return 2;
  }
  let feed;
  try {
    feed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`cannot read ${file}: ${error.message}`);
    return 1;
  }
  const problems = validateFeed(feed);
  const arg = (name) => rest[rest.indexOf(name) + 1];
  if (rest.includes('--sig')) {
    try {
      if (!verifySignature(feed, readFileSync(arg('--sig'), 'utf8'), readFileSync(arg('--key'), 'utf8'))) problems.push('signature does not verify');
    } catch (error) {
      problems.push(`signature could not be checked: ${error.message}`);
    }
  }
  for (const p of problems) console.error(`threat-feed: ${p}`);
  if (problems.length === 0) console.log('threat-feed: ok');
  return problems.length === 0 ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(main(process.argv.slice(2)));
