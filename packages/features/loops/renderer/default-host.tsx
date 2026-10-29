import { useEffect, useRef, type ReactNode } from 'react';
import { LuBot } from 'react-icons/lu';
import { create } from 'zustand';

import type { IconComponent } from '@midnite/studio-frame';
import {
  DEFAULT_LOOPS,
  createBlankCustomLoop,
  duplicateLoopAsCustom,
  restartCustomLoop,
  type FabTab,
  type SuiteAppId,
} from '@midnite/studio-shared';

import type {
  LoopsExtrasComposerProps,
  LoopsHost,
  LoopsIconSelectProps,
  LoopsMultiIconSelectProps,
  LoopsState,
  LoopsTerminalState,
  LoopsTooltipProps,
} from './host';

/**
 * The loops host every suite app but Studio composes (Phase 123 Theme G).
 *
 * Lives beside the port rather than in the frame: the frame may not import a
 * feature, so it could not name the port's type. Loop settings are held in
 * memory for the window's life (Studio's live in its persisted `ui-store`),
 * the terminal is an empty one that cannot start an agent — the app's shell
 * composer fills `startAgent` and `renderTerminal` from the terminal feature —
 * and the menu carries no companion, Notes or Setup leaf. Chrome is plain: a
 * title attribute for a tooltip, native selects, a textarea.
 */

const NO_LOOP_IDS: Record<string, never> = {};

function omit<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}

/** The per-loop records a deleted custom loop takes with it. */
const PER_LOOP_KEYS = [
  'fabSessions',
  'fabPrevSessions',
  'loopModifierDefaults',
  'loopModifierChecks',
  'loopChoices',
  'loopAgents',
  'loopModels',
  'loopSchedules',
  'loopExtras',
  'loopEnabled',
  'loopModifierSkills',
  'loopRunOptions',
] as const;

type MapKey = (typeof PER_LOOP_KEYS)[number];

export function createDefaultLoopsState() {
  return create<LoopsState>()((set) => {
    /** `state[key][loopId] = value`, the shape of nearly every setter. */
    const put = <K extends MapKey>(key: K, loopId: string, value: LoopsState[K][string]): void =>
      set((state) => ({ [key]: { ...(state[key] as Record<string, unknown>), [loopId]: value } }) as Partial<LoopsState>);
    const nested = <K extends 'loopModifierChecks' | 'loopChoices' | 'loopModifierSkills'>(
      key: K,
      loopId: string,
      inner: string,
      value: boolean | string,
    ): void =>
      set(
        (state) =>
          ({
            [key]: {
              ...(state[key] as Record<string, unknown>),
              [loopId]: { ...(state[key][loopId] as Record<string, unknown>), [inner]: value },
            },
          }) as Partial<LoopsState>,
      );
    const slot = (key: 'fabSessions' | 'fabPrevSessions', tab: FabTab, sessionId: string | undefined): void =>
      set((state) => {
        const next = { ...state[key] };
        if (sessionId === undefined) delete next[tab];
        else next[tab] = sessionId;
        return { [key]: next } as Partial<LoopsState>;
      });

    return {
      fabPanelOpen: false,
      setFabPanelOpen: (fabPanelOpen) => set({ fabPanelOpen }),
      activeFabTab: 'guard',
      openFabTab: (tab) => set({ fabPanelOpen: true, activeFabTab: tab }),
      fabSessions: {},
      setFabSession: (tab, sessionId) => slot('fabSessions', tab, sessionId),
      fabPrevSessions: {},
      setFabPrevSession: (tab, sessionId) => slot('fabPrevSessions', tab, sessionId),
      selectedRepoId: null,
      selectedWorktreePath: null,
      agentSkills: {},
      loopModifierDefaults: {},
      loopModifierChecks: {},
      setLoopModifierCheck: (loopId, modifierId, on) => nested('loopModifierChecks', loopId, modifierId, on),
      loopChoices: {},
      setLoopChoice: (loopId, choiceId, optionId) => nested('loopChoices', loopId, choiceId, optionId),
      loopAgents: {},
      setLoopAgent: (loopId, agentId) => put('loopAgents', loopId, agentId),
      loopModels: {},
      setLoopModel: (loopId, model) => put('loopModels', loopId, model),
      loopSchedules: {},
      setLoopSchedule: (loopId, schedule) => put('loopSchedules', loopId, schedule),
      loopExtras: {},
      setLoopExtras: (loopId, text) => put('loopExtras', loopId, text),
      loopEnabled: {},
      loopModifierSkills: {},
      setLoopModifierSkill: (loopId, modifierId, skill) => nested('loopModifierSkills', loopId, modifierId, skill),
      loopRunOptions: {},
      setLoopRunOptions: (loopId, patch) =>
        set((state) => ({ loopRunOptions: { ...state.loopRunOptions, [loopId]: { ...state.loopRunOptions[loopId], ...patch } } })),
      customLoops: [],
      customLoopEditing: null,
      customLoopFresh: null,
      setCustomLoopEditing: (loopId) =>
        set((state) => ({
          customLoopEditing: loopId,
          ...(loopId !== state.customLoopFresh ? { customLoopFresh: null } : {}),
        })),
      startCustomLoopFrom: (loopId, sourceLoopId) =>
        set((state) => {
          const current = state.customLoops.find((loop) => loop.id === loopId);
          if (!current) return {};
          const source = DEFAULT_LOOPS.find((loop) => loop.id === sourceLoopId);
          const template = source
            ? duplicateLoopAsCustom(source, state.agentSkills[source.agentCommandId] ?? source.fallbackPrompt)
            : createBlankCustomLoop();
          const next = restartCustomLoop(current, template);
          return {
            customLoops: state.customLoops.map((loop) => (loop.id === loopId ? next : loop)),
            loopModifierChecks: omit(state.loopModifierChecks, loopId),
            loopModifierDefaults: omit(state.loopModifierDefaults, loopId),
            loopChoices: omit(state.loopChoices, loopId),
            loopModifierSkills: omit(state.loopModifierSkills, loopId),
          };
        }),
      updateCustomLoop: (loopId, edit) =>
        set((state) => {
          const index = state.customLoops.findIndex((loop) => loop.id === loopId);
          if (index < 0) return {};
          const customLoops = [...state.customLoops];
          customLoops[index] = { ...edit(state.customLoops[index]!), id: loopId, custom: true };
          return { customLoops, ...(state.customLoopFresh === loopId ? { customLoopFresh: null } : {}) };
        }),
      deleteCustomLoop: (loopId) =>
        set((state) => {
          const index = state.customLoops.findIndex((loop) => loop.id === loopId);
          if (index < 0) return {};
          const customLoops = state.customLoops.filter((loop) => loop.id !== loopId);
          const cleared: Record<string, unknown> = {};
          for (const key of PER_LOOP_KEYS) cleared[key] = omit(state[key] as Record<string, unknown>, loopId);
          const fallback = (customLoops[index - 1]?.id ?? DEFAULT_LOOPS[DEFAULT_LOOPS.length - 1]!.id) as FabTab;
          return {
            ...(cleared as Partial<LoopsState>),
            customLoops,
            ...(state.activeFabTab === loopId ? { activeFabTab: fallback } : {}),
            ...(state.customLoopEditing === loopId ? { customLoopEditing: null } : {}),
            ...(state.customLoopFresh === loopId ? { customLoopFresh: null } : {}),
          };
        }),
      layout: { loopFormHeight: 0 },
      setLayout: (_key, value) => set({ layout: { loopFormHeight: value } }),
    };
  });
}

const EMPTY_TERMINAL: LoopsTerminalState = {
  sessions: [],
  states: NO_LOOP_IDS,
  activity: NO_LOOP_IDS,
  ptyIds: NO_LOOP_IDS,
  closeSession: () => undefined,
  sleepSession: () => undefined,
};

const defaultAgentIcon: IconComponent = LuBot;

function DefaultTooltip({ label, children }: LoopsTooltipProps) {
  return <span title={typeof label === 'string' ? label : undefined}>{children}</span>;
}

function DefaultIconSelect({ ariaLabel, options, value, onChange, isDisabled }: LoopsIconSelectProps) {
  return (
    <select aria-label={ariaLabel} value={value} disabled={isDisabled} onChange={(e) => onChange(e.target.value)}>
      {options.map((option) => (
        <option key={option.id} value={option.id} disabled={option.isDisabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function DefaultMultiIconSelect({ ariaLabel, options, values, onChange, isDisabled }: LoopsMultiIconSelectProps) {
  return (
    <select
      multiple
      aria-label={ariaLabel}
      value={[...values]}
      disabled={isDisabled}
      onChange={(e) => onChange(Array.from(e.target.selectedOptions, (option) => option.value))}
    >
      {options.map((option) => (
        <option key={option.id} value={option.id} disabled={option.isDisabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function DefaultExtrasComposer(props: LoopsExtrasComposerProps) {
  const { value, onChange, onSend, canSend, placeholder, ariaLabel, rows = 2, sendAriaLabel = 'Send', testIdPrefix } = props;
  return (
    <div data-testid={testIdPrefix}>
      <textarea
        ref={props.textareaRef}
        aria-label={ariaLabel}
        rows={rows}
        placeholder={placeholder}
        value={value}
        onKeyDown={props.onKeyDown}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" aria-label={sendAriaLabel} disabled={!canSend} title={props.sendTooltip} onClick={onSend}>
        Send
      </button>
    </div>
  );
}

/** Escape and an outside press close it; the app's layered rule set is Studio's. */
function useDefaultDismissable({ open, surfaceRef, onDismiss }: Parameters<LoopsHost['useDismissable']>[0]): void {
  const latest = useRef(onDismiss);
  latest.current = onDismiss;
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') latest.current();
    };
    const onPointer = (event: PointerEvent) => {
      const surface = surfaceRef.current;
      if (surface && event.target instanceof Node && !surface.contains(event.target)) latest.current();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open, surfaceRef]);
}

export type DefaultLoopsHostOptions = {
  /** The loop settings store, when the caller (a test) needs to seed or read it. */
  state?: ReturnType<typeof createDefaultLoopsState>;
  /** The app's terminal feature, for a Start press. Absent: Start rejects. */
  startAgent?: LoopsHost['startAgent'];
  renderTerminal?: LoopsHost['renderTerminal'];
  renderCompanionLauncher?: () => ReactNode;
};

export function createDefaultLoopsHost(appId: SuiteAppId, options: DefaultLoopsHostOptions = {}): LoopsHost {
  const useState = options.state ?? createDefaultLoopsState();
  return {
    appId,
    useLoopsState: (selector) => useState(selector),
    loopsState: () => useState.getState(),
    useTerminal: (selector) => selector(EMPTY_TERMINAL),
    terminalState: () => EMPTY_TERMINAL,
    startAgent: options.startAgent ?? (() => Promise.reject(new Error('This app has no terminal to run a loop in.'))),
    renderTerminal: options.renderTerminal ?? (() => null),
    renderCompanionLauncher: options.renderCompanionLauncher ?? (() => null),
    useAgents: () => ({ agents: [] }),
    useRepos: () => ({ data: undefined }),
    useKnownSkills: () => ({ data: undefined }),
    useContributors: () => ({ data: undefined }),
    Tooltip: DefaultTooltip,
    IconSelect: DefaultIconSelect,
    MultiIconSelect: DefaultMultiIconSelect,
    ExtrasComposer: DefaultExtrasComposer,
    resolveAgentIcon: () => defaultAgentIcon,
    useDismissable: useDefaultDismissable,
  };
}

