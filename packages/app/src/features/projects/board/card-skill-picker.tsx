import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { LuChevronDown } from 'react-icons/lu';

import { useDismissable } from '../../../components/use-dismissable';
import {
  filterSkillSuggestions,
  SKILL_GROUP_LABEL,
  type SkillSuggestion,
} from './card-skill';

/**
 * The Projects card's skill picker: an editable ARIA combobox, not a closed
 * select. It always holds text — prepopulated by the caller's default — and
 * whatever it holds is what the card's Play button sends, verbatim, so a
 * typed `/midnite-create 98 D` launches with its arguments intact.
 *
 * `value` is the committed text. Typing edits a local draft that filters the
 * suggestions; the draft is committed (`onCommit`) on Enter, on picking a
 * suggestion, and on blur — so clicking the card's Play button straight
 * from the input commits first, since the click blurs it.
 *
 * Escape closes the suggestion list first (through the shared
 * `useDismissable`, so it outranks the panel's own Escape); a second Escape
 * with the list closed reverts an uncommitted draft and falls through.
 */
export function CardSkillPicker({
  value,
  suggestions,
  onCommit,
  ariaLabel = 'Skill',
}: {
  value: string;
  suggestions: readonly SkillSuggestion[];
  onCommit: (text: string) => void;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // Opening shows every suggestion; only typing narrows them. A prepopulated
  // `/midnite-create` would otherwise filter the list down to itself.
  const [filtering, setFiltering] = useState(false);
  const [active, setActive] = useState(-1);

  const text = draft ?? value;
  const shown = useMemo(
    () => (filtering ? filterSkillSuggestions(suggestions, text) : [...suggestions]),
    [filtering, suggestions, text],
  );
  const expanded = open && shown.length > 0;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  const close = () => {
    setOpen(false);
    setFiltering(false);
    setActive(-1);
  };

  useDismissable({
    open: expanded,
    onDismiss: () => close(),
    surfaceRef: wrapperRef,
    trigger: inputRef,
    layer: 'menu',
    occludes: false,
  });

  const commit = (next: string) => {
    setDraft(null);
    close();
    if (next !== value) onCommit(next);
  };

  const pick = (suggestion: SkillSuggestion) => {
    setDraft(null);
    close();
    // An explicit pick is recorded even when it matches the prepopulated
    // default — choosing it is what makes it this card's skill.
    onCommit(suggestion.value);
  };

  const openList = () => {
    setOpen(true);
    setFiltering(false);
  };

  const move = (delta: 1 | -1) => {
    if (!expanded) {
      openList();
      setActive(delta === 1 ? 0 : suggestions.length - 1);
      return;
    }
    setActive((current) => {
      if (current === -1) return delta === 1 ? 0 : shown.length - 1;
      return (current + delta + shown.length) % shown.length;
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = expanded && active >= 0 ? shown[active] : undefined;
      if (option) pick(option);
      else commit(text);
    } else if (event.key === 'Escape' && !expanded && draft !== null) {
      // The list is already closed (an open one is `useDismissable`'s), so
      // this Escape reverts the uncommitted edit.
      event.preventDefault();
      setDraft(null);
    }
  };

  const activeOption = expanded && active >= 0 ? shown[active] : undefined;

  return (
    <div ref={wrapperRef} className="relative" data-testid="card-skill-picker">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listboxId}
        aria-activedescendant={activeOption ? optionId(active) : undefined}
        value={text}
        spellCheck={false}
        autoComplete="off"
        placeholder="/midnite-create-adhoc"
        onChange={(event) => {
          setDraft(event.target.value);
          setOpen(true);
          setFiltering(true);
          setActive(-1);
        }}
        onClick={() => {
          if (!open) openList();
        }}
        onBlur={() => {
          if (draft !== null) commit(draft);
        }}
        onKeyDown={onKeyDown}
        className="h-7 w-full rounded-md border border-border bg-card pl-2 pr-7 font-mono text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={expanded ? 'Hide skill suggestions' : 'Show skill suggestions'}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (expanded) close();
          else openList();
          inputRef.current?.focus();
        }}
        className="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <LuChevronDown aria-hidden className="h-3.5 w-3.5" />
      </button>
      {expanded ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Skill suggestions"
          className="hide-scrollbar absolute left-0 top-full z-menu mt-1 max-h-72 w-full animate-fade-in overflow-y-auto rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-lg"
        >
          {groupRuns(shown).map(({ group, start }) => {
            const headingId = `${baseId}-group-${group}`;
            const members = shown.slice(start, start + countRun(shown, start));
            return (
              <div key={group} role="group" aria-labelledby={headingId}>
                <div
                  id={headingId}
                  role="presentation"
                  className="px-2 pb-0.5 pt-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {SKILL_GROUP_LABEL[group]}
                </div>
                {members.map((suggestion, offset) => {
                  const index = start + offset;
                  return (
                    <div
                      key={suggestion.value}
                      id={optionId(index)}
                      role="option"
                      aria-selected={index === active}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => pick(suggestion)}
                      className={`cursor-pointer px-2 py-1 text-xs ${index === active ? 'bg-accent' : 'hover:bg-accent'}`}
                    >
                      <span className="block truncate font-mono">{suggestion.label}</span>
                      {suggestion.description ? (
                        <span className="line-clamp-2 block text-[11px] text-muted-foreground">
                          {suggestion.description}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Where each group's run of suggestions starts — `buildSkillSuggestions`
 *  emits each group contiguously, and filtering keeps that order. */
function groupRuns(list: readonly SkillSuggestion[]): { group: SkillSuggestion['group']; start: number }[] {
  const runs: { group: SkillSuggestion['group']; start: number }[] = [];
  list.forEach((suggestion, index) => {
    if (index === 0 || list[index - 1]!.group !== suggestion.group) runs.push({ group: suggestion.group, start: index });
  });
  return runs;
}

function countRun(list: readonly SkillSuggestion[], start: number): number {
  let end = start;
  while (end < list.length && list[end]!.group === list[start]!.group) end += 1;
  return end - start;
}
