/** How the "Thinking…" indicator in every AI thread animates (Settings ▸ Appearance). */
export const THINKING_STYLES = ['spinner', 'ellipsis', 'claude'] as const;
export type ThinkingStyle = (typeof THINKING_STYLES)[number];

export const THINKING_STYLE_LABELS: Record<ThinkingStyle, { label: string; hint: string }> = {
  spinner: { label: 'Spinner', hint: 'A rotating ring beside the text (default)' },
  ellipsis: { label: 'Ellipsis', hint: 'Animated dots after the text' },
  claude: { label: 'Claude', hint: 'The star glyphs the Claude CLI cycles through' },
};

/** The glyphs Claude Code's own spinner cycles, in order. */
export const CLAUDE_GLYPHS = ['·', '✢', '✳', '✶', '✻', '✽'] as const;
