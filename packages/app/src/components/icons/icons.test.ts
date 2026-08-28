import { BUILTIN_AGENTS } from '@midnite/git-shared';
import { Terminal } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import {
  AGENT_ICONS,
  AntigravityIcon,
  ClaudeIcon,
  CodexIcon,
  OpenClaudeIcon,
  OpenCodeIcon,
} from './index';
import { resolveAgentIcon } from './index';

/**
 * The registry is the one thing standing between an agent roster and
 * multiple copies of Claude's mark, so "every builtin resolves to a DIFFERENT component"
 * is the assertion that actually matters here.
 */
describe('resolveAgentIcon', () => {
  it('gives every builtin its own mark', () => {
    const marks = BUILTIN_AGENTS.map((agent) => resolveAgentIcon(agent));

    expect(marks).toEqual([
      ClaudeIcon,
      AntigravityIcon,
      CodexIcon,
      OpenClaudeIcon,
      OpenCodeIcon,
    ]);
    expect(new Set(marks).size).toBe(BUILTIN_AGENTS.length);
  });

  /**
   * `icon` defaults to `id`, which is what keeps three of the four builtins
   * from repeating themselves — only `agy` names one, because "agy" is the
   * command and "antigravity" is what the mark is called.
   */
  it('falls back to the id when no icon key is named', () => {
    expect(resolveAgentIcon({ id: 'claude' })).toBe(ClaudeIcon);
    expect(resolveAgentIcon({ id: 'agy', icon: 'antigravity' })).toBe(AntigravityIcon);
  });

  it('resolves a react-icons name, so a user-added agent needs no SVG', () => {
    expect(resolveAgentIcon({ id: 'gemini', icon: 'SiGooglegemini' })).toBe(
      AGENT_ICONS['SiGooglegemini'],
    );
    expect(AGENT_ICONS['SiGooglegemini']).toBeDefined();
  });

  it('falls back to a terminal glyph for a key it has never heard of', () => {
    expect(resolveAgentIcon({ id: 'aider' })).toBe(Terminal);
    expect(resolveAgentIcon({ id: 'x', icon: 'SiNotAThing' })).toBe(Terminal);
  });

  /**
   * The fallback is supposed to guarantee that a typo in a hand-edited
   * `agents.json` costs a glyph rather than a row. A bare `AGENT_ICONS[key]`
   * lookup walks the prototype chain, so for these three keys it resolved to an
   * inherited function, `??` never fired, and React was handed something that
   * is not a component — costing the row.
   */
  it.each(['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty'])(
    'does not resolve the inherited key %s',
    (icon) => {
      expect(resolveAgentIcon({ id: 'x', icon })).toBe(Terminal);
    },
  );
});
