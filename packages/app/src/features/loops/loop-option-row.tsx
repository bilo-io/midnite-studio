import {
  loopModifierFragment,
  normaliseLoopSkill,
  type ContributorStat,
  type KnownSkill,
  type LoopModifier,
} from '@midnite/studio-shared';
import { useId, useState, type KeyboardEvent } from 'react';
import { LuChevronRight, LuX } from 'react-icons/lu';

import { SwitchTrack } from '../../components/form/toggle-rows';
import type { IconSelectOption } from '../../components/select/icon-select';
import { Tooltip } from '../../components/tooltip';

/**
 * One on/off option in a loop's composer: a switch with a hover tooltip saying
 * what it does, a chevron that shows the exact words it adds to the line, and —
 * while it is on and its fragment names a skill — a skill field.
 *
 * Every modifier is drawn this way, jobs and standing policies alike. The
 * checkbox grid it replaces had no room for anything but a label, and the
 * three things this row adds are what a user actually needs before trusting
 * an unattended run: what a box means, what it will literally send, and which
 * skill it will send it with.
 */
export function LoopOptionRow({
  modifier,
  on,
  skill,
  skillSuggestions,
  onToggle,
  onSkill,
}: {
  modifier: LoopModifier;
  on: boolean;
  /** The text in this option's skill field; empty means its default fragment. */
  skill: string;
  skillSuggestions: readonly KnownSkill[];
  onToggle: (modifierId: string, on: boolean) => void;
  onSkill: (modifierId: string, skill: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const previewId = useId();
  const takesSkill = modifier.skillTemplate !== undefined;
  const fragment = loopModifierFragment(modifier, skill);

  return (
    <div data-loop-option={modifier.id} className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-controls={previewId}
          aria-label={`${expanded ? 'Hide' : 'Show'} the prompt ${modifier.label} adds`}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <LuChevronRight
            aria-hidden
            className={`h-3 w-3 transition-transform duration-150 ease-in-out ${expanded ? 'rotate-90' : ''}`}
          />
        </button>
        <TooltipSwitchRow
          id={modifier.id}
          label={modifier.label}
          tooltip={modifier.description ?? modifier.promptFragment}
          on={on}
          onToggle={onToggle}
        />
      </div>
      {on && takesSkill ? (
        <div className="pl-5">
          <SkillCombobox
            label={`Skill for ${modifier.label}`}
            value={skill}
            placeholder={modifier.defaultSkill ?? 'Default — no skill'}
            suggestions={skillSuggestions}
            onChange={(next) => onSkill(modifier.id, next)}
          />
        </div>
      ) : null}
      <pre
        id={previewId}
        hidden={!expanded}
        aria-label={`Prompt ${modifier.label} adds`}
        data-testid={`loop-option-prompt-${modifier.id}`}
        className="ml-5 select-text whitespace-pre-wrap break-words rounded border border-border/60 bg-muted/40 px-1.5 py-1 font-mono text-[10px] leading-snug text-muted-foreground"
      >
        {fragment}
      </pre>
    </div>
  );
}

/**
 * A switch row whose explanation is a real tooltip rather than a native
 * `title`. The tooltip wraps the input, not the label: the input is stretched
 * transparently over the whole row, so it is what the pointer actually rests
 * on — and what keyboard focus lands on, which a `title` could never answer.
 */
export function TooltipSwitchRow({
  id,
  label,
  tooltip,
  on,
  onToggle,
}: {
  id: string;
  label: string;
  tooltip: string;
  on: boolean;
  onToggle: (id: string, on: boolean) => void;
}) {
  return (
    <label className="relative flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 text-[11px] text-muted-foreground hover:text-foreground">
      <span className="min-w-0 truncate">{label}</span>
      <Tooltip label={tooltip} side="top">
        <input
          type="checkbox"
          role="switch"
          checked={on}
          onChange={(event) => onToggle(id, event.target.checked)}
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </Tooltip>
      <SwitchTrack />
    </label>
  );
}

const SOURCE_LABEL: Record<KnownSkill['source'], string> = {
  midnite: 'Midnite',
  repo: 'Repo',
  user: 'User',
};

/** How many suggestions the list shows at once — enough to choose from, short enough for a 320px panel. */
const MAX_SUGGESTIONS = 8;

/**
 * The suggestions for what has been typed so far: name matches before
 * description matches, prefix matches before infix ones. Exported for the
 * composer test.
 */
export function matchSkills(suggestions: readonly KnownSkill[], text: string): KnownSkill[] {
  const query = normaliseLoopSkill(text).slice(1).toLowerCase();
  if (query.length === 0) return suggestions.slice(0, MAX_SUGGESTIONS);
  const rank = (skill: KnownSkill): number => {
    const name = skill.name.toLowerCase();
    if (name.startsWith(query)) return 0;
    if (name.includes(query)) return 1;
    if (skill.description?.toLowerCase().includes(query)) return 2;
    return 3;
  };
  return suggestions
    .map((skill) => ({ skill, rank: rank(skill) }))
    .filter((entry) => entry.rank < 3)
    .sort((a, b) => a.rank - b.rank || a.skill.name.localeCompare(b.skill.name))
    .slice(0, MAX_SUGGESTIONS)
    .map((entry) => entry.skill);
}

/**
 * A single combobox for a skill: type to filter the known skills, pick one,
 * or keep whatever free text you typed — `composeLoopPrompt` normalises it
 * either way (a bare name gains its `/`).
 *
 * The list is drawn in flow, under the input, rather than floated over the
 * form: the composer's sections are `<Collapse>` bodies that clip overflow,
 * and a list that pushes the rows below it down is one that can never be cut
 * off.
 */
export function SkillCombobox({
  label,
  value,
  placeholder,
  suggestions,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  suggestions: readonly KnownSkill[];
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const matches = matchSkills(suggestions, value);
  const expanded = open && matches.length > 0;
  const activeIndex = Math.min(active, Math.max(0, matches.length - 1));
  const optionId = (index: number) => `${listId}-option-${index}`;

  const pick = (skill: KnownSkill) => {
    onChange(`/${skill.name}`);
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) setOpen(true);
      else setActive((activeIndex + 1) % Math.max(1, matches.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((activeIndex - 1 + matches.length) % Math.max(1, matches.length));
    } else if (event.key === 'Enter' && expanded) {
      event.preventDefault();
      const chosen = matches[activeIndex];
      if (chosen) pick(chosen);
    } else if (event.key === 'Escape' && expanded) {
      // Close the list, and only the list — not the FAB panel around it.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="relative flex min-w-0 items-center">
        <input
          type="text"
          role="combobox"
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={expanded ? optionId(activeIndex) : undefined}
          value={value}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => {
            onChange(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="loop-spectrum-field h-6 min-w-0 flex-1 rounded px-1.5 pr-5 font-mono text-[10px] text-foreground outline-none placeholder:text-muted-foreground/70"
        />
        {value.length > 0 ? (
          <button
            type="button"
            aria-label={`Clear ${label} — use the default`}
            // Keep focus where it is; the click alone clears.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChange('')}
            className="absolute right-1 flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          >
            <LuX aria-hidden className="h-3 w-3" />
          </button>
        ) : null}
      </div>
      <ul
        id={listId}
        role="listbox"
        aria-label={`${label} suggestions`}
        hidden={!expanded}
        className="max-h-40 overflow-y-auto rounded border border-border bg-popover py-0.5 text-popover-foreground shadow-sm"
      >
        {expanded
          ? matches.map((skill, index) => (
              <li
                key={`${skill.source}:${skill.name}`}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                // Keep focus in the input so its blur does not close the list
                // before the click lands.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(skill)}
                title={skill.description}
                className={`flex min-w-0 cursor-pointer items-center gap-1.5 px-1.5 py-0.5 text-[10px] ${
                  index === activeIndex ? 'bg-accent' : 'hover:bg-accent'
                }`}
              >
                <span className="shrink-0 font-mono text-foreground">/{skill.name}</span>
                {skill.description ? (
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{skill.description}</span>
                ) : (
                  <span className="flex-1" />
                )}
                <span
                  data-skill-source={skill.source}
                  className="shrink-0 rounded-full border border-border px-1 text-[9px] uppercase tracking-wide text-muted-foreground"
                >
                  {SOURCE_LABEL[skill.source]}
                </span>
              </li>
            ))
          : null}
      </ul>
    </div>
  );
}

/**
 * The repo's contributors as the Users filter's rows — one per GitHub
 * username, so a person committing under two emails is one option. The chip
 * says the username (that is what the prompt sends); the menu says who it is.
 *
 * The username comes from a GitHub noreply address when there is one
 * (`123+login@users.noreply.github.com`), else the email's local part.
 */
export function contributorOptions(
  contributors: readonly Pick<ContributorStat, 'name' | 'email' | 'commits'>[],
): IconSelectOption[] {
  const seen = new Set<string>();
  return contributors.flatMap((contributor) => {
    const noreply = /^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/i.exec(contributor.email);
    const username =
      noreply?.[1] ??
      (contributor.email.split('@')[0] || contributor.name.trim().toLowerCase().replace(/\s+/g, '-'));
    if (!username || seen.has(username)) return [];
    seen.add(username);
    const name = contributor.name.trim() || username;
    return [
      {
        id: username,
        label: username,
        display: name !== username ? `${name} (${username})` : name,
        hint: `${contributor.commits} commit${contributor.commits === 1 ? '' : 's'}`,
      },
    ];
  });
}
