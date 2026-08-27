import { access, readdir, readFile } from 'node:fs/promises';

/**
 * The slice of the filesystem discovery needs. Injected everywhere, the same
 * split `detect.ts` makes for the diagnostics registry — discovery is a pure
 * function over file contents and directory listings, so it tests without a
 * real checkout anywhere on disk.
 */
export type TestsFs = {
  /** File contents, or `null` when missing or unreadable — never throws. */
  readFile: (absPath: string) => Promise<string | null>;
  /** Directory entries, or `[]` when missing — never throws. */
  listDir: (absPath: string) => Promise<{ name: string; isDirectory: boolean }[]>;
  exists: (absPath: string) => Promise<boolean>;
};

export const realTestsFs: TestsFs = {
  readFile: async (absPath) => {
    try {
      return await readFile(absPath, 'utf8');
    } catch {
      return null;
    }
  },
  listDir: async (absPath) => {
    try {
      const entries = await readdir(absPath, { withFileTypes: true });
      return entries.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }));
    } catch {
      return [];
    }
  },
  exists: async (absPath) => {
    try {
      await access(absPath);
      return true;
    } catch {
      return false;
    }
  },
};

/** `JSON.parse` that never throws — a malformed `package.json` is one with no scripts. */
export function safeJsonParse(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
