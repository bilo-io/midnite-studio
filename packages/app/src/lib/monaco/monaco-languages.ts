/**
 * File extension → Monaco language id.
 *
 * `lib/languages.ts`'s `languageForFile` returns SHIKI ids, and the two id
 * spaces differ in several places (`shellscript`→`shell`, `docker`→
 * `dockerfile`, `jsonc`→`json`, …) — an explicit translation table over the
 * same extensions rather than reusing the Shiki id directly, which would
 * silently fall back to plaintext for every id Monaco does not recognise.
 */
export const MONACO_LANG_BY_EXT: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  jsonc: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  vue: 'html',
  svelte: 'html',
  md: 'markdown',
  mdx: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  xml: 'xml',
  svg: 'xml',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  // Monaco ships no Prisma grammar (it fell back to plaintext silently); drop it explicitly.
  prisma: 'plaintext',
  // Monaco's id is `proto` (its definition lives in a directory named `protobuf`, which is where
  // the phase doc's `protobuf` claim came from). The test reads the real registrations.
  proto: 'proto',
  tf: 'hcl',
  dockerfile: 'dockerfile',
  // Monaco ships no `diff` language; it fell back to plaintext silently, so say so.
  diff: 'plaintext',
  patch: 'plaintext',
  lua: 'lua',
  zig: 'plaintext',
  ini: 'ini',
  conf: 'ini',
  ex: 'plaintext',
  exs: 'plaintext',
};

/** Extensionless-but-known file names — mirrors `lib/languages.ts`'s `LANG_BY_NAME`. */
export const MONACO_LANG_BY_NAME: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'shell',
  '.gitignore': 'ini',
  '.gitattributes': 'ini',
  '.npmrc': 'ini',
  '.prototools': 'ini',
  '.zshrc': 'shell',
  '.bashrc': 'shell',
  '.zprofile': 'shell',
};

/** Monaco language id for a file name, or `'plaintext'` — Monaco has no "no language" state. */
export function monacoLanguageForFile(fileName: string): string {
  const lower = fileName.toLowerCase();
  const byName = MONACO_LANG_BY_NAME[lower];
  if (byName) return byName;
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return 'plaintext';
  return MONACO_LANG_BY_EXT[lower.slice(dot + 1)] ?? 'plaintext';
}
