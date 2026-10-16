import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { modelsForAgent, type AgentDefinition, type AgentModelInfo, type AgentStatus } from '@midnite/studio-shared';
import { LuCheck, LuSearch } from 'react-icons/lu';

import { agentInstallHint, isAgentUnconfigured } from '../features/agent/agent-install-status';
import { PROPRIETARY_IDS } from '../features/terminal/new-session-menu';
import { useOllamaModels } from '@midnite/studio-feature-models/renderer';
import { useAgents } from '../features/terminal/use-agents';
import { fuzzyMatch } from '../services/palette/fuzzy-match';
import { useUiStore } from '../store/ui-store';
import { resolveAgentIcon } from './icons';
import { Popover } from './popover';
import { Tooltip } from './tooltip';

/** An agent's own default is stored as `null`; the catalogue spells it `default` for Claude. */
function isDefaultModel(modelId: string | null | undefined): boolean {
  return modelId == null || modelId === 'default';
}

/**
 * Dropdown trigger in the titlebar showing the SVG logo of the currently active
 * primary agent, and allowing the user to select/set the primary agent from
 * the searchable dropdown list.
 */
export function TitleBarPrimaryAgent() {
  const [open, setOpen] = useState(false);
  const { agents, status } = useAgents();
  const primaryAgent = useUiStore((s) => s.primaryAgent);
  const setPrimaryAgent = useUiStore((s) => s.setPrimaryAgent);
  const setPrimaryModel = useUiStore((s) => s.setPrimaryModel);
  const primaryModel = useUiStore((s) => s.primaryModelByAgent[s.primaryAgent] ?? null);
  const focusAgentInSettings = useUiStore((s) => s.focusAgentInSettings);

  const activeAgent = agents.find((a) => a.id === primaryAgent) ?? agents[0];
  const ActiveIcon = activeAgent ? resolveAgentIcon(activeAgent) : resolveAgentIcon({ id: 'claude' });
  // The pill shows only a deliberately chosen model; an agent on its own default stays a bare icon.
  const modelLabel = isDefaultModel(primaryModel)
    ? null
    : (modelsForAgent(primaryAgent).find((m) => m.id === primaryModel)?.label ?? primaryModel);
  const label = activeAgent
    ? `Primary agent: ${activeAgent.label}${modelLabel ? ` · ${modelLabel}` : ''}`
    : 'Select primary agent';

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side="bottom"
      align="end"
      label={label}
      testId="titlebar-primary-agent"
      panelClassName="w-72"
      triggerClassName="inline-flex h-6 min-w-6 shrink-0 items-center justify-center gap-1 rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[open=true]:bg-accent cursor-pointer"
      trigger={
        <Tooltip label={label} side="bottom">
          <span className={`flex items-center justify-center gap-1 ${modelLabel ? 'px-1' : ''}`}>
            <ActiveIcon
              aria-hidden
              className="h-3.5 w-3.5 shrink-0"
              style={activeAgent?.accent ? { color: activeAgent.accent } : undefined}
            />
            {modelLabel ? (
              <span
                data-testid="titlebar-primary-model"
                className="max-w-24 truncate rounded bg-accent px-1 text-[10px] font-medium leading-4 text-foreground"
              >
                {modelLabel}
              </span>
            ) : null}
          </span>
        </Tooltip>
      }
    >
      {open ? (
        <PrimaryAgentPickerPanel
          agents={agents}
          status={status}
          primaryAgent={primaryAgent}
          primaryModel={primaryModel}
          onSelectModel={(modelId) => {
            setPrimaryModel(primaryAgent, isDefaultModel(modelId) ? null : modelId);
            setOpen(false);
          }}
          onSelect={(agentId) => {
            setPrimaryAgent(agentId);
            setOpen(false);
          }}
          onConfigure={(agentId) => {
            focusAgentInSettings(agentId);
            setOpen(false);
          }}
        />
      ) : null}
    </Popover>
  );
}

function matchesQuery(query: string, agent: AgentDefinition): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;
  return Boolean(fuzzyMatch(trimmed, agent.label) ?? fuzzyMatch(trimmed, agent.command));
}

type AgentSection = {
  id: 'proprietary' | 'open-source';
  label: string;
  agents: AgentDefinition[];
};

function PrimaryAgentPickerPanel({
  agents,
  status,
  primaryAgent,
  primaryModel,
  onSelectModel,
  onSelect,
  onConfigure,
}: {
  agents: AgentDefinition[];
  status: AgentStatus[];
  primaryAgent: string;
  primaryModel: string | null;
  /** Picks a model for the current primary agent. */
  onSelectModel: (modelId: string) => void;
  onSelect: (agentId: string) => void;
  /** Called instead of `onSelect` for an unconfigured agent — routes to Settings ▸ Agents. */
  onConfigure: (agentId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  // The primary agent's own models, listed under the agents (Claude, Ollama).
  // Reported up from `ModelSection` so one ArrowUp/ArrowDown walk covers both.
  const [models, setModels] = useState<AgentModelInfo[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filteredSections = useMemo<AgentSection[]>(() => {
    const proprietary = agents.filter(
      (a) => PROPRIETARY_IDS.has(a.id) && matchesQuery(query, a),
    );
    const openSource = agents.filter(
      (a) => !PROPRIETARY_IDS.has(a.id) && matchesQuery(query, a),
    );

    const result: AgentSection[] = [];
    if (proprietary.length > 0) {
      result.push({ id: 'proprietary', label: 'Proprietary', agents: proprietary });
    }
    if (openSource.length > 0) {
      result.push({ id: 'open-source', label: 'Open Source', agents: openSource });
    }
    return result;
  }, [agents, query]);

  const flatAgents = useMemo<AgentDefinition[]>(
    () => filteredSections.flatMap((s) => s.agents),
    [filteredSections],
  );

  const indexById = useMemo(() => {
    const map = new Map<string, number>();
    flatAgents.forEach((a, i) => map.set(a.id, i));
    return map;
  }, [flatAgents]);

  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  // Agents first, then the model rows — hidden while a search narrows the agent list.
  const visibleModels = query.trim() ? [] : models;
  const total = flatAgents.length + visibleModels.length;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (total === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((current) => (current + 1) % total);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((current) => (current - 1 + total) % total);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (highlighted >= flatAgents.length) {
        const model = visibleModels[highlighted - flatAgents.length];
        if (model) onSelectModel(model.id);
        return;
      }
      const target = flatAgents[highlighted];
      if (target) {
        if (isAgentUnconfigured(target, status)) onConfigure(target.id);
        else onSelect(target.id);
      }
    }
  };

  const noMatches = query.trim().length > 0 && filteredSections.length === 0;

  return (
    <div onKeyDown={onKeyDown}>
      <div className="flex items-center gap-2 border-b border-border px-2.5">
        <LuSearch aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find an agent…"
          className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          autoComplete="off"
          spellCheck={false}
          aria-label="Search agents"
        />
      </div>
      <div
        role="menu"
        aria-label="Select primary agent"
        aria-orientation="vertical"
        className="hide-scrollbar max-h-64 overflow-auto p-1"
      >
        {noMatches ? (
          <p className="px-2.5 py-6 text-center text-xs text-muted-foreground">
            No agent matches &quot;{query}&quot;.
          </p>
        ) : (
          filteredSections.map((section) => (
            <div key={section.id}>
              <div className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {section.label}
              </div>
              {section.agents.map((agent) => {
                const itemIndex = indexById.get(agent.id) ?? 0;
                const isHighlighted = highlighted === itemIndex;
                const isSelected = agent.id === primaryAgent;
                const Icon = resolveAgentIcon(agent);
                // Unconfigured, not disabled: the row stays a real, clickable
                // button — clicking (or Enter) routes to Settings ▸ Agents
                // instead of setting it primary. See `new-session-picker.tsx`
                // for the same split in the terminal's `+` menu.
                const unconfigured = isAgentUnconfigured(agent, status);

                return (
                  <button
                    key={agent.id}
                    type="button"
                    role="menuitemradio"
                    tabIndex={-1}
                    aria-label={agent.label}
                    aria-checked={isSelected}
                    aria-selected={isHighlighted}
                    aria-disabled={unconfigured ? true : undefined}
                    title={unconfigured ? agentInstallHint(agent) : undefined}
                    data-testid={`primary-agent-item-${agent.id}`}
                    onClick={() => (unconfigured ? onConfigure(agent.id) : onSelect(agent.id))}
                    onMouseEnter={() => setHighlighted(itemIndex)}
                    className={`flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors ${
                      isHighlighted ? 'bg-accent text-foreground' : 'text-foreground'
                    } ${isSelected ? 'font-medium' : ''} ${unconfigured ? 'opacity-40' : ''}`}
                  >
                    <Icon
                      aria-hidden
                      className="h-4 w-4 shrink-0"
                      style={agent.accent && !unconfigured ? { color: agent.accent } : undefined}
                    />
                    <span className="flex-1 truncate">{agent.label}</span>
                    {isSelected && (
                      <LuCheck
                        aria-hidden
                        data-testid={`primary-agent-check-${agent.id}`}
                        className="h-3.5 w-3.5 text-primary shrink-0"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
      {query.trim() ? null : (
        <div className="hide-scrollbar max-h-44 overflow-auto border-t border-border p-1">
          <ModelSection
            agentId={primaryAgent}
            selected={primaryModel}
            offset={flatAgents.length}
            highlighted={highlighted}
            onHighlight={setHighlighted}
            onSelect={onSelectModel}
            onModels={setModels}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The primary agent's model list, under the agent rows. Rendered only for an
 * agent offering more than one model; Ollama's come from the daemon, so the
 * query lives here and runs only while the panel is open on Ollama.
 */
function ModelSection({
  agentId,
  selected,
  offset,
  highlighted,
  onHighlight,
  onSelect,
  onModels,
}: {
  agentId: string;
  selected: string | null;
  /** Index of the first model row in the panel's single keyboard walk. */
  offset: number;
  highlighted: number;
  onHighlight: (index: number) => void;
  onSelect: (modelId: string) => void;
  onModels: (models: AgentModelInfo[]) => void;
}) {
  const ollama = useOllamaModels();
  const listed = useMemo(() => {
    const models = modelsForAgent(agentId, agentId === 'ollama' ? ollama.data?.map((m) => m.name) : undefined);
    return models.length > 1 ? models : [];
  }, [agentId, ollama.data]);

  useEffect(() => {
    onModels(listed);
    return () => onModels([]);
  }, [listed, onModels]);

  if (listed.length === 0) return null;
  const current = selected ?? 'default';

  return (
    <div data-testid="primary-model-section" role="group" aria-label="Model">
      <div className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Model
      </div>
      {listed.map((model, i) => {
        const index = offset + i;
        const isSelected = model.id === current;
        return (
          <button
            key={model.id}
            type="button"
            role="menuitemradio"
            tabIndex={-1}
            aria-label={model.label}
            aria-checked={isSelected}
            aria-selected={highlighted === index}
            data-testid={`primary-model-item-${model.id}`}
            onClick={() => onSelect(model.id)}
            onMouseEnter={() => onHighlight(index)}
            className={`flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors ${
              highlighted === index ? 'bg-accent text-foreground' : 'text-foreground'
            } ${isSelected ? 'font-medium' : ''}`}
          >
            <span className="flex-1 truncate">{model.label}</span>
            {isSelected && <LuCheck aria-hidden className="h-3.5 w-3.5 shrink-0 text-primary" />}
          </button>
        );
      })}
    </div>
  );
}
