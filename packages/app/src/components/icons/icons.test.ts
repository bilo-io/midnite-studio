import { BUILTIN_AGENTS } from '@midnite/studio-shared';
import { LuTerminal } from 'react-icons/lu';
import { describe, expect, it } from 'vitest';

import {
  AGENT_ICONS,
  AiderIcon,
  AntigravityIcon,
  ClaudeIcon,
  CodexIcon,
  GrokIcon,
  KiloIcon,
  OpenClaudeIcon,
  OpenCodeIcon,
} from './index';
import { resolveAgentIcon } from './index';
import { SiCline, SiCursor, SiGithubcopilot } from 'react-icons/si';

/**
 * The registry is the one thing standing between an agent roster and
 * multiple copies of Claude's mark, so "every builtin resolves to a DIFFERENT component"
 * is the assertion that actually matters here.
 */
describe('resolveAgentIcon', () => {
  /**
   * Goose is the one deliberate exception: it has no mark in
   * react-icons' curated `si` set (checked against its full export list —
   * no Goose/Block one), and CLAUDE.md's rule is to omit `icon` rather than
   * invent a name, so it falls back to the generic `LuTerminal` glyph a
   * roster entry with no mark at all gets. Every OTHER builtin gets its own.
   */
  it('gives every builtin with a mark its own — only goose uses the generic fallback', () => {
    const marks = BUILTIN_AGENTS.map((agent) => resolveAgentIcon(agent));

    expect(marks).toEqual([
      ClaudeIcon,
      SiCursor,
      AntigravityIcon,
      CodexIcon,
      SiGithubcopilot,
      OpenClaudeIcon,
      OpenCodeIcon,
      KiloIcon,
      AiderIcon,
      SiCline,
      GrokIcon,
      LuTerminal, // goose — no icon key, no react-icons mark to name
    ]);

    const named = marks.filter((mark) => mark !== LuTerminal);
    expect(new Set(named).size).toBe(named.length);
  });

  /**
   * `icon` defaults to `id`, which is what keeps three of the four builtins
   * from repeating themselves — only `agy` names one, because "agy" is the
   * command and "antigravity" is what the mark is called.
   */
  it('falls back to the id when no icon key is named', () => {
    expect(resolveAgentIcon({ id: 'claude' })).toBe(ClaudeIcon);
    expect(resolveAgentIcon({ id: 'grok' })).toBe(GrokIcon);
    expect(resolveAgentIcon({ id: 'agy', icon: 'antigravity' })).toBe(AntigravityIcon);
  });

  it('resolves a react-icons name, so a user-added agent needs no SVG', () => {
    expect(resolveAgentIcon({ id: 'gemini', icon: 'SiGooglegemini' })).toBe(
      AGENT_ICONS['SiGooglegemini'],
    );
    expect(AGENT_ICONS['SiGooglegemini']).toBeDefined();
  });

  it('falls back to a terminal glyph for a key it has never heard of', () => {
    expect(resolveAgentIcon({ id: 'unknown-agent' })).toBe(LuTerminal);
    expect(resolveAgentIcon({ id: 'x', icon: 'SiNotAThing' })).toBe(LuTerminal);
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
      expect(resolveAgentIcon({ id: 'x', icon })).toBe(LuTerminal);
    },
  );
});
