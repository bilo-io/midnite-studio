// vitest/node: pure string and file logic, no browser capability needed.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { redactBytesForDisk, redactForDisk, redactJsonForDisk, setDiskRedactionSecrets } from './disk-redaction';
import { createFileSink } from './log/log-sink';

// A 52-char base64 string with no prefix: the shape of an Azure DevOps PAT, which no pattern can key on.
const AZURE_PAT = 'q3b7m2x9k4v8n1c5z6a0w7e2r4t9y1u3i5o8p0l2k4j6h8g1f3d5';
const SHA = 'a'.repeat(8) + '0123456789abcdef0123456789abcdef';

afterEach(() => setDiskRedactionSecrets([]));

describe('redact on write (Phase 115 Theme C)', () => {
  it('scrubs a stored prefixless token by value, and leaves a commit sha alone', () => {
    setDiskRedactionSecrets([{ name: 'forge-accounts:azure', value: AZURE_PAT, kind: 'vault' }]);
    const out = redactForDisk(`pushed ${SHA} using ${AZURE_PAT}`);
    expect(out).not.toContain(AZURE_PAT);
    expect(out).toContain(SHA);
  });

  it('does not collapse the home directory (a chat wants its real paths back)', () => {
    expect(redactForDisk('see /Users/someone/Dev/x')).toBe('see /Users/someone/Dev/x');
  });

  it('scrubs every string leaf of a JSON value', () => {
    setDiskRedactionSecrets([{ name: 'secrets:k', value: AZURE_PAT, kind: 'vault' }]);
    const out = redactJsonForDisk({ chat: { messages: [{ text: `key ${AZURE_PAT}`, n: 1 }] } });
    expect(JSON.stringify(out)).not.toContain(AZURE_PAT);
    expect(out.chat.messages[0]?.n).toBe(1);
  });

  it('scrubs terminal bytes, and returns null when nothing matched', () => {
    setDiskRedactionSecrets([{ name: 'secrets:k', value: AZURE_PAT, kind: 'vault' }]);
    const dirty = Buffer.from(`\u001b[32mexport T=${AZURE_PAT}\u001b[0m\r\n`);
    const out = redactBytesForDisk(dirty);
    expect(out && Buffer.from(out).toString()).not.toContain(AZURE_PAT);
    expect(redactBytesForDisk(Buffer.from('plain output\n'))).toBeNull();
  });

  it('scrubs bytes that are not valid UTF-8 without disturbing the rest', () => {
    setDiskRedactionSecrets([{ name: 'secrets:k', value: AZURE_PAT, kind: 'vault' }]);
    const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(` ${AZURE_PAT} `), Buffer.from([0x80])]);
    const out = Buffer.from(redactBytesForDisk(bytes) ?? []);
    expect(out.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xfe]));
    expect(out.at(-1)).toBe(0x80);
    expect(out.toString('latin1')).not.toContain(AZURE_PAT);
  });

  it('writes log records scrubbed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mstudio-disk-redact-'));
    try {
      setDiskRedactionSecrets([{ name: 'forge-accounts:azure', value: AZURE_PAT, kind: 'vault' }]);
      const sink = createFileSink({ dir, now: () => 1 });
      sink.write('error', `request failed with ${AZURE_PAT} at ${SHA}`);
      const text = readFileSync(sink.path, 'utf8');
      expect(text).not.toContain(AZURE_PAT);
      expect(text).toContain(SHA);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
