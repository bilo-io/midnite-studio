import { BUILTIN_AGENTS } from '@midnite/studio-shared';
import { LuTerminal } from 'react-icons/lu';
import { describe, expect, it } from 'vitest';

import {
  AGENT_ICONS,
  AiderIcon,
  AntigravityIcon,
  ClaudeIcon,
  CodexIcon,
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
   * Grok and Goose are the one deliberate exception: neither has a mark in
   * react-icons' curated `si` set (checked against its full export list —
   * no xAI/Grok glyph, no Goose/Block one), and CLAUDE.md's rule is to omit
   * `icon` rather than invent a name, so both fall back to the same generic
   * `LuTerminal` glyph a roster entry with no mark at all gets. Every OTHER
   * builtin still gets its own — this only relaxes the invariant for the two
   * rows that were never going to have a distinct one.
   */
  it('gives every builtin with a mark its own — grok and goose share the generic fallback', () => {
    const marks = BUILTIN_AGENTS.map((agent) => resolveAgentIcon(agent));

    expect(marks).toEqual([
      ClaudeIcon,
      AntigravityIcon,
      CodexIcon,
      SiCursor,
      SiGithubcopilot,
      OpenClaudeIcon,
      OpenCodeIcon,
      KiloIcon,
      AiderIcon,
      SiCline,
      LuTerminal, // grok — no icon key, no react-icons mark to name
      LuTerminal, // goose — same
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
