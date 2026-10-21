import { useState } from 'react';
import { LuCheck, LuChevronDown, LuSearch } from 'react-icons/lu';

import type { IconComponent } from '../icon-button';
import { Popover } from '../popover';

export interface PickerProvider {
  id: string;
  label: string;
  icon: IconComponent;
  /** Brand colour, applied only while this provider is the selected one. */
  color?: string;
  recommended?: boolean;
  disabled?: boolean;
  /** Why it is disabled — shown as the row's title. */
  reason?: string;
}

export interface PickerModel {
  id: string;
  label: string;
  recommended?: boolean;
}

/** Case-insensitive substring filter over labels (and ids). */
export function filterPickerItems<T extends { id: string; label: string }>(items: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  return items.filter((i) => i.label.toLowerCase().includes(q) || i.id.toLowerCase().includes(q));
}

function SearchList<T extends { id: string; label: string; recommended?: boolean; disabled?: boolean; reason?: string }>({
  items,
  selectedId,
  onSelect,
  label,
  testId,
  renderIcon,
}: {
  items: readonly T[];
  selectedId: string;
  onSelect: (id: string) => void;
  label: string;
  testId: string;
  renderIcon?: (item: T, selected: boolean) => React.ReactNode;
}) {
  const [query, setQuery] = useState('');
  const shown = filterPickerItems(items, query);
  return (
    <div className="flex flex-col gap-1 p-1">
      <div className="flex items-center gap-1.5 rounded border border-border/60 bg-background px-1.5">
        <LuSearch aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          aria-label={`Search ${label.toLowerCase()}`}
          data-testid={`${testId}-search`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${label.toLowerCase()}…`}
          className="h-6 flex-1 bg-transparent text-xs placeholder:text-muted-foreground/70 focus-visible:outline-none"
        />
      </div>
      <div role="listbox" aria-label={label} className="flex max-h-56 flex-col overflow-auto">
        {shown.length === 0 ? <p className="px-2 py-1.5 text-xs text-muted-foreground">No matches</p> : null}
        {shown.map((item) => {
          const selected = item.id === selectedId;
          return (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={item.disabled}
              title={item.disabled ? item.reason : undefined}
              onClick={() => onSelect(item.id)}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {renderIcon?.(item, selected)}
              <span className="flex-1 truncate">{item.label}</span>
              {item.recommended ? (
                <span className="rounded bg-primary/10 px-1 text-[10px] font-medium text-primary">Recommended</span>
              ) : null}
              {selected ? <LuCheck aria-hidden className="h-3 w-3 shrink-0" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The icon is full colour only for the selected provider; every other one is muted. */
export function ProviderGlyph({ provider, selected }: { provider: PickerProvider; selected: boolean }) {
  const Icon = provider.icon;
  return (
    <span data-selected={selected} data-testid={`provider-glyph-${provider.id}`} className="flex shrink-0">
      <Icon
        aria-hidden
        className={`h-3.5 w-3.5 ${selected ? '' : 'text-muted-foreground'}`}
        {...(selected && provider.color ? { style: { color: provider.color } } : {})}
      />
    </span>
  );
}

const TRIGGER =
  'flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground';

/**
 * Provider + model pickers for the composer's `leading`/`trailing` slot: an
 * icon button (full colour only for the selected provider) and, beside it, the
 * selected provider's model. Each opens an upward, searchable popover. Hides
 * the model picker when the provider lists no models.
 */
export function ProviderModelPicker({
  providers,
  provider,
  onProviderChange,
  models,
  model,
  onModelChange,
  testId = 'provider-model-picker',
}: {
  providers: readonly PickerProvider[];
  provider: string;
  onProviderChange: (id: string) => void;
  models: readonly PickerModel[];
  model: string;
  onModelChange: (id: string) => void;
  testId?: string;
}) {
  const [providerOpen, setProviderOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const selected = providers.find((p) => p.id === provider);
  const selectedModel = models.find((m) => m.id === model);
  return (
    <div className="flex items-center gap-0.5" data-testid={testId}>
      <Popover
        label={`Provider: ${selected?.label ?? 'none'}`}
        side="top"
        align="start"
        open={providerOpen}
        onOpenChange={setProviderOpen}
        testId={`${testId}-provider`}
        triggerClassName={TRIGGER}
        panelClassName="w-56"
        trigger={selected ? <ProviderGlyph provider={selected} selected /> : <span>Provider</span>}
      >
        <SearchList
          items={providers}
          selectedId={provider}
          label="Providers"
          testId={`${testId}-provider-list`}
          renderIcon={(p, isSelected) => <ProviderGlyph provider={p} selected={isSelected} />}
          onSelect={(id) => {
            setProviderOpen(false);
            onProviderChange(id);
          }}
        />
      </Popover>
      {models.length > 0 ? (
        <Popover
          label={`Model: ${selectedModel?.label ?? 'none'}`}
          side="top"
          align="start"
          open={modelOpen}
          onOpenChange={setModelOpen}
          testId={`${testId}-model`}
          triggerClassName={TRIGGER}
          panelClassName="w-60"
          trigger={
            <>
              <span className="max-w-[9rem] truncate">{selectedModel?.label ?? 'Model'}</span>
              <LuChevronDown aria-hidden className="h-3 w-3" />
            </>
          }
        >
          <SearchList
            items={models}
            selectedId={model}
            label="Models"
            testId={`${testId}-model-list`}
            onSelect={(id) => {
              setModelOpen(false);
              onModelChange(id);
            }}
          />
        </Popover>
      ) : null}
    </div>
  );
}
