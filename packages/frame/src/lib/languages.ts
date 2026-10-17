/**
 * File → shiki grammar, as a hand-rolled extension map (Phase 16 decision:
 * predictable, zero extra deps; unknown extensions render as plain text —
 * for a preview that is a feature, not a failure).
 *
 * Values are shiki *bundled-language* ids: `loadLanguage(id)` on the bundled
 * highlighter dynamic-imports just that grammar, so this table is also the
 * complete list of what can ever be pulled into the bundle.
 */
const LANG_BY_EXT: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  jsonc: 'jsonc',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  vue: 'vue',
  svelte: 'svelte',
  md: 'markdown',
  mdx: 'mdx',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  svg: 'xml',
  sh: 'shellscript',
  bash: 'shellscript',
  zsh: 'shellscript',
  fish: 'fish',
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
  prisma: 'prisma',
  proto: 'proto',
  tf: 'hcl',
  dockerfile: 'docker',
  diff: 'diff',
  patch: 'diff',
  lua: 'lua',
  zig: 'zig',
  ini: 'ini',
  conf: 'ini',
  ex: 'elixir',
  exs: 'elixir',
};

/** Extensionless-but-known file names. */
const LANG_BY_NAME: Record<string, string> = {
  dockerfile: 'docker',
  makefile: 'make',
  '.gitignore': 'ini',
  '.gitattributes': 'ini',
  '.npmrc': 'ini',
  '.prototools': 'toml',
  '.zshrc': 'shellscript',
  '.bashrc': 'shellscript',
  '.zprofile': 'shellscript',
};

/** shiki language id for a file name, or null → render as plain text. */
export function languageForFile(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  const byName = LANG_BY_NAME[lower];
  if (byName) return byName;
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return null;
  return LANG_BY_EXT[lower.slice(dot + 1)] ?? null;
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif']);
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'm4v']);
const AUDIO_EXTS = new Set(['mp3', 'wav', 'm4a', 'ogg', 'flac']);

export type PreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'markdown' | 'text';

/** How the preview pane should treat this file, from its name alone. */
export function previewKindForFile(fileName: string): PreviewKind {
  const lower = fileName.toLowerCase();
  const ext = lower.slice(lower.lastIndexOf('.') + 1);
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'md' || ext === 'mdx' || ext === 'markdown') return 'markdown';
  return 'text';
}
