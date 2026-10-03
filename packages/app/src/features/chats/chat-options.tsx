import { useState } from 'react';

import type { ChatMode } from '@midnite/studio-shared';
import { CHAT_MODES } from '@midnite/studio-shared';
import { LuCheck, LuChevronDown, LuEye, LuFolderGit2, LuPencilLine } from 'react-icons/lu';

import type { IconComponent } from '../../components/icon-button';
import { Popover } from '../../components/popover';

/**
 * The composer's option sheets: small upward popovers, one per setting, next to
 * the engine/model picker. Each is a listbox — a trigger that names the current
 * choice, a panel of rows with the choice ticked.
 */

export type OptionRow = {
  id: string;
  label: string;
  description?: string;
  icon?: IconComponent;
  disabled?: boolean;
  /** Why it is disabled — the row's title. */
  reason?: string;
};

const TRIGGER =
  'flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground';

export function OptionPicker({
  label,
  options,
  value,
  onChange,
  testId,
  triggerIcon: TriggerIcon,
  triggerText,
  width = 'w-64',
  disabled = false,
}: {
  /** Accessible name of the trigger and the listbox. */
  label: string;
  options: readonly OptionRow[];
  value: string;
  onChange: (id: string) => void;
  testId: string;
  triggerIcon?: IconComponent;
  /** Defaults to the selected row's label. */
  triggerText?: string;
  width?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);
  if (disabled) {
    return (
      <span aria-disabled data-testid={testId} className={`${TRIGGER} cursor-default opacity-50 hover:bg-transparent`}>
        {TriggerIcon ? <TriggerIcon aria-hidden className="h-3 w-3" /> : null}
        <span className="max-w-[9rem] truncate">{triggerText ?? selected?.label ?? label}</span>
      </span>
    );
  }
  return (
    <Popover
      label={`${label}: ${selected?.label ?? 'none'}`}
      side="top"
      align="start"
      open={open}
      onOpenChange={setOpen}
      testId={testId}
      triggerClassName={TRIGGER}
      panelClassName={width}
      trigger={
        <>
          {TriggerIcon ? <TriggerIcon aria-hidden className="h-3 w-3" /> : null}
          <span className="max-w-[9rem] truncate">{triggerText ?? selected?.label ?? label}</span>
          <LuChevronDown aria-hidden className="h-3 w-3" />
        </>
      }
    >
      <div role="listbox" aria-label={label} className="flex max-h-64 flex-col overflow-auto p-1">
        {options.map((option) => {
          const Icon = option.icon;
          const isSelected = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              disabled={option.disabled}
              title={option.disabled ? option.reason : undefined}
              data-testid={`${testId}-option-${option.id || 'none'}`}
              onClick={() => {
                setOpen(false);
                onChange(option.id);
              }}
              className="flex items-start gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {Icon ? <Icon aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{option.label}</span>
                {option.description ? <span className="block text-[11px] leading-snug text-muted-foreground">{option.description}</span> : null}
              </span>
              {isSelected ? <LuCheck aria-hidden className="mt-0.5 h-3 w-3 shrink-0" /> : null}
            </button>
          );
        })}
      </div>
    </Popover>
  );
}

const MODE_ICON: Record<ChatMode, IconComponent> = { ask: LuEye, edit: LuPencilLine };

/** Ask (read-only) or Edit (changes come back for review). */
export function ModePicker({ value, onChange, disabled }: { value: ChatMode; onChange: (mode: ChatMode) => void; disabled?: boolean }) {
  return (
    <OptionPicker
      label="Mode"
      testId="chat-mode-picker"
      value={value}
      width="w-72"
      triggerIcon={MODE_ICON[value]}
      options={CHAT_MODES.map((m) => ({ id: m.id, label: m.label, description: m.description, icon: MODE_ICON[m.id] }))}
      onChange={(id) => onChange(id as ChatMode)}
      {...(disabled ? { disabled } : {})}
    />
  );
}

export const NO_REPO_ID = '';

/** The repository a chat is about — what the agent can see and edit. */
export function RepoPicker({
  repos,
  value,
  onChange,
  disabled,
}: {
  repos: readonly { id: string; name: string }[];
  /** A repo id, or {@link NO_REPO_ID}. */
  value: string;
  onChange: (repoId: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <OptionPicker
      label="Repository"
      testId="chat-repo-picker"
      value={value}
      width="w-64"
      triggerIcon={LuFolderGit2}
      triggerText={repos.find((r) => r.id === value)?.name ?? 'No repository'}
      options={[{ id: NO_REPO_ID, label: 'No repository', description: 'A general chat with no files to read or change' }, ...repos.map((r) => ({ id: r.id, label: r.name }))]}
      onChange={(id) => onChange(id === NO_REPO_ID ? null : id)}
      {...(disabled ? { disabled } : {})}
    />
  );
}
