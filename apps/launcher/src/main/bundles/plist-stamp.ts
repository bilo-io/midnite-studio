/**
 * Rewrites top-level keys of an XML `Info.plist` — the stub's own name, bundle
 * id, executable and icon over a copy of the runtime's plist (Theme B's
 * `stampPlist`, which shelled out to PlistBuddy, done in-process so it is a
 * unit test on any OS).
 *
 * Only the root `<dict>`'s direct entries are touched: `CFBundleName` also
 * appears *inside* nested dicts in some plists (URL types, document types), and
 * a regex over the whole text would rewrite those too. electron-builder writes
 * XML plists; a binary plist is refused rather than guessed at.
 */

type Entry = { key: string; start: number; end: number };

const xmlEscape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** End index (exclusive) of the one plist value element that starts at or after `from`. */
function valueEnd(text: string, from: number): number {
  const open = text.indexOf('<', from);
  if (open < 0) throw new Error('Info.plist: value expected');
  const close = text.indexOf('>', open);
  const tag = text.slice(open + 1, close);
  if (tag.endsWith('/')) return close + 1; // <true/>, <dict/>, <array/>
  const name = tag.split(/\s/)[0] ?? '';
  if (name !== 'dict' && name !== 'array') {
    const end = text.indexOf(`</${name}>`, close);
    if (end < 0) throw new Error(`Info.plist: unterminated <${name}>`);
    return end + name.length + 3;
  }
  // A container: count nested <dict>/<array> opens against closes.
  let depth = 1;
  const re = /<(\/?)(dict|array)(\s*\/?)>/g;
  re.lastIndex = close + 1;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if ((m[3] ?? '').includes('/')) continue; // self-closing, no depth change
    depth += m[1] === '/' ? -1 : 1;
    if (depth === 0) return m.index + m[0].length;
  }
  throw new Error(`Info.plist: unterminated <${name}>`);
}

function rootEntries(text: string): { entries: Entry[]; bodyEnd: number } {
  if (!text.includes('<plist')) throw new Error('Info.plist is not an XML plist');
  const rootOpen = text.indexOf('<dict>', text.indexOf('<plist'));
  if (rootOpen < 0) throw new Error('Info.plist has no root <dict>');
  const entries: Entry[] = [];
  let at = rootOpen + '<dict>'.length;
  for (;;) {
    const next = text.indexOf('<', at);
    if (next < 0) throw new Error('Info.plist: unterminated root <dict>');
    if (text.startsWith('</dict>', next)) return { entries, bodyEnd: next };
    if (!text.startsWith('<key>', next)) throw new Error('Info.plist: <key> expected in root <dict>');
    const keyEnd = text.indexOf('</key>', next);
    const key = text.slice(next + 5, keyEnd);
    const end = valueEnd(text, keyEnd + 6);
    entries.push({ key, start: next, end });
    at = end;
  }
}

export type PlistStamp = {
  /** String values to set — replaced in place when present, appended when not. */
  set: Readonly<Record<string, string>>;
  /** Keys to drop entirely, whatever their value's type. */
  remove?: readonly string[];
};

export function stampPlist(text: string, { set, remove = [] }: PlistStamp): string {
  const { entries, bodyEnd } = rootEntries(text);
  const pending = new Map(Object.entries(set));
  let out = '';
  let cursor = 0;
  for (const entry of entries) {
    if (remove.includes(entry.key)) {
      out += text.slice(cursor, entry.start);
      // Swallow the indentation/newline that led into the dropped entry.
      out = out.replace(/[ \t]*\n?[ \t]*$/, '');
      cursor = entry.end;
      continue;
    }
    const value = pending.get(entry.key);
    if (value !== undefined) {
      out += text.slice(cursor, entry.start) + `<key>${entry.key}</key>\n\t<string>${xmlEscape(value)}</string>`;
      cursor = entry.end;
      pending.delete(entry.key);
    }
  }
  out += text.slice(cursor, bodyEnd);
  for (const [key, value] of pending) {
    out = out.replace(/\s*$/, '') + `\n\t<key>${key}</key>\n\t<string>${xmlEscape(value)}</string>\n`;
  }
  return out + text.slice(bodyEnd);
}

/** A top-level string value, or `null`. */
export function readPlistString(text: string, key: string): string | null {
  const entry = rootEntries(text).entries.find((e) => e.key === key);
  if (entry === undefined) return null;
  const m = /<key>[^<]*<\/key>\s*<string>([^<]*)<\/string>/.exec(text.slice(entry.start, entry.end));
  return m?.[1] ?? null;
}
