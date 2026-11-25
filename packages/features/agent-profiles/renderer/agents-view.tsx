import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { LuBot, LuInfo, LuLayoutGrid, LuPencilRuler } from 'react-icons/lu';

import { useFrameChrome, type IconComponent } from '@midnite/studio-frame';
import { createBlankAgentProfile, type AgentProfile } from '@midnite/studio-shared';

import { AgentsBuilder } from './agents-builder';
import { AgentsInfo } from './agents-info';
import { AgentsList } from './agents-list';
import { FOCUS_RING, PageDetachMark } from './ui';
import { useAgentProfiles } from './use-agent-profiles';
import { usePanelWidth } from './use-panel-width';

type Tab = 'list' | 'builder' | 'info';

const TABS: { id: Tab; label: string; Icon: IconComponent }[] = [
  { id: 'list', label: 'Your agents', Icon: LuLayoutGrid },
  { id: 'builder', label: 'Builder', Icon: LuPencilRuler },
  { id: 'info', label: 'Info', Icon: LuInfo },
];

/** Below this the header count hides. */
const COUNT_MIN_WIDTH = 480;

/**
 * The Agents page (Phase 154 Theme C): header, a tab strip (Your agents, Builder, Info) and the active
 * panel, which alone scrolls. Tab and draft state is not persisted; the view opens on the list.
 */
export function AgentsView() {
  const { profiles, loading, error, refetch } = useAgentProfiles();
  const [tab, setTab] = useState<Tab>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AgentProfile | null>(null);
  const [draftIsNew, setDraftIsNew] = useState(false);
  // The name of the agent being edited while it has unsaved changes, else null.
  const [dirtyName, setDirtyName] = useState<string | null>(null);
  const dialogs = useFrameChrome().useDialogs();
  const root = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ list: null, builder: null, info: null });
  const width = usePanelWidth(root);

  const onDirtyChange = useCallback((name: string | null) => setDirtyName(name), []);

  /** Runs `action`, after a Discard confirm when the open agent has unsaved changes. */
  const guarded = (action: () => void): void => {
    if (dirtyName === null) {
      action();
      return;
    }
    dialogs.confirm({
      title: `Discard changes to ${dirtyName}?`,
      body: 'Your edits to this agent have not been saved.',
      confirmLabel: 'Discard',
      danger: true,
      blastRadius: null,
      warnings: [],
      onConfirm: () => {
        setDirtyName(null);
        action();
      },
    });
  };
  const openNow = (profile: AgentProfile, isNew: boolean): void => {
    setEditingId(profile.id);
    setDraft(isNew ? profile : null);
    setDraftIsNew(isNew);
    setTab('builder');
  };
  const open = (profile: AgentProfile, isNew: boolean): void => {
    // Re-opening the agent already being edited loses nothing.
    if (tab === 'builder' && profile.id === editingId) openNow(profile, isNew);
    else guarded(() => openNow(profile, isNew));
  };
  const switchTab = (target: Tab): void => {
    if (target === tab) return;
    if (tab === 'builder') guarded(() => setTab(target));
    else setTab(target);
  };
  const editing = draft ?? profiles.find((p) => p.id === editingId) ?? null;

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;
    event.preventDefault();
    const target = TABS[next]!.id;
    switchTab(target);
    tabRefs.current[target]?.focus();
  };

  return (
    <div ref={root} data-testid="agents-view" className="flex h-full min-h-0 flex-col gap-3 p-4">
      <header className="flex items-center gap-2">
        <PageDetachMark role="agents" />
        <LuBot aria-hidden className="h-5 w-5" />
        <h1 className="text-sm font-semibold">Agents</h1>
        {!loading && error === null && width >= COUNT_MIN_WIDTH ? (
          <span className="ml-auto text-[11px] text-muted-foreground">
            {profiles.length} {profiles.length === 1 ? 'agent' : 'agents'}
          </span>
        ) : null}
      </header>

      <div role="tablist" aria-label="Agents" className="flex items-center gap-1 border-b border-border/60">
        {TABS.map(({ id, label, Icon }, index) => (
          <button
            key={id}
            ref={(el) => {
              tabRefs.current[id] = el;
            }}
            id={`agents-tab-${id}`}
            type="button"
            role="tab"
            data-testid={`agents-tab-${id}`}
            aria-label={id === 'builder' && dirtyName !== null ? 'Builder, unsaved changes' : undefined}
            aria-selected={tab === id}
            aria-controls={`agents-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => switchTab(id)}
            onKeyDown={(event) => onTabKey(event, index)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-2.5 py-1.5 text-xs font-medium transition-colors ${FOCUS_RING} ${
              tab === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {id === 'builder' && dirtyName !== null ? <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
          </button>
        ))}
      </div>

      <div id={`agents-panel-${tab}`} role="tabpanel" aria-labelledby={`agents-tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'list' ? <AgentsList profiles={profiles} loading={loading} error={error} onRetry={refetch} onOpen={open} /> : null}
        {tab === 'builder' ? (
          <AgentsBuilder
            profile={editing}
            isNew={draftIsNew}
            onNew={() => open(createBlankAgentProfile(), true)}
            onDirtyChange={onDirtyChange}
            onSaved={(saved) => {
              // Keep the saved copy until the list refetches, so the form does not blink to empty.
              setDraft(saved);
              setDraftIsNew(false);
            }}
            onDone={() => {
              setDirtyName(null);
              setDraft(null);
              setEditingId(null);
              setDraftIsNew(false);
              setTab('list');
            }}
          />
        ) : null}
        {tab === 'info' ? <AgentsInfo /> : null}
      </div>
    </div>
  );
}
