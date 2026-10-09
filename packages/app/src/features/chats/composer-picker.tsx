import { useEffect, useRef } from 'react';

import { LuFileText, LuSparkles } from 'react-icons/lu';

import { splitHighlight, type FileMatch, type MatchRange, type PickerKind, type SkillMatch } from './composer-tokens';

/**
 * The popover the Chats composer opens above itself for `/` (skills) and `@`
 * (files). Purely presentational: the composer owns the keyboard (the caret
 * never leaves the textarea), this renders the ≤10 rows and reports a click.
 * Rows take `mousedown` with `preventDefault` so clicking one does not blur
 * the field and close the picker before the click lands.
 */

export type PickerRow = { key: string; title: string; titleRange: MatchRange | null; subtitle: string; subtitleRange: MatchRange | null };

export function skillRows(matches: readonly SkillMatch[]): PickerRow[] {
  return matches.map(({ skill, range }) => ({
    key: skill.name,
    title: skill.name,
    titleRange: range,
    subtitle: skill.description || (skill.scope === 'plugin' ? 'Plugin skill' : skill.scope === 'user' ? 'Your skill' : 'Project skill'),
    subtitleRange: null,
  }));
}

export function fileRows(matches: readonly FileMatch[]): PickerRow[] {
  return matches.map((m) => ({
    key: m.path,
    title: m.name,
    titleRange: m.nameRange,
    subtitle: m.dir === '' ? './' : m.dir,
    subtitleRange: m.dir === '' ? null : m.dirRange,
  }));
}

function Highlighted({ text, range }: { text: string; range: MatchRange | null }) {
  const { before, match, after } = splitHighlight(text, range);
  if (match === '') return <>{text}</>;
  return (
    <>
      {before}
      <mark data-testid="chat-picker-match" className="rounded-sm bg-primary/20 font-semibold text-foreground">
        {match}
      </mark>
      {after}
    </>
  );
}

export function ComposerPicker({
  kind,
  query,
  rows,
  active,
  onPick,
  onHover,
  emptyReason,
}: {
  kind: PickerKind;
  query: string;
  rows: readonly PickerRow[];
  active: number;
  onPick: (index: number) => void;
  onHover: (index: number) => void;
  /** Shown when nothing at all is available (vs. nothing matching the query). */
  emptyReason: string | null;
}) {
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const Icon = kind === 'skill' ? LuSparkles : LuFileText;
  const sigil = kind === 'skill' ? '/' : '@';
  const noun = kind === 'skill' ? 'skills' : 'files';

  return (
    <div
      data-testid="chat-picker"
      data-kind={kind}
      className="absolute inset-x-0 bottom-full z-30 mb-1.5 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg"
    >
      <div className="flex items-center justify-between border-b border-border/60 px-2 py-1 text-[10px] text-muted-foreground">
        <span className="font-medium uppercase tracking-wide">{kind === 'skill' ? 'Skills' : 'Files'}</span>
        <span>↑↓ move · Tab insert · Esc close</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-2 py-2 text-xs text-muted-foreground" data-testid="chat-picker-empty">
          {emptyReason ?? `No ${noun} match “${sigil}${query}”`}
        </p>
      ) : (
        <ul ref={list} role="listbox" aria-label={kind === 'skill' ? 'Skills' : 'Files'} className="max-h-80 overflow-y-auto p-1">
          {rows.map((row, index) => (
            <li
              key={row.key}
              role="option"
              aria-selected={index === active}
              data-testid="chat-picker-option"
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => onHover(index)}
              onClick={() => onPick(index)}
              className={`flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 ${index === active ? 'bg-accent text-accent-foreground' : ''}`}
            >
              <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs">
                  {kind === 'skill' ? <span className="text-muted-foreground">/</span> : null}
                  <Highlighted text={row.title} range={row.titleRange} />
                </div>
                <div className="truncate text-[10px] text-muted-foreground" title={row.subtitle}>
                  <Highlighted text={row.subtitle} range={row.subtitleRange} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
