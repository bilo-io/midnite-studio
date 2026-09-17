import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import type { AgentDefinition } from '@midnite/studio-shared';
import { LuCheck, LuSearch } from 'react-icons/lu';

import { PROPRIETARY_IDS } from '../features/terminal/new-session-menu';
import { useAgents } from '../features/terminal/use-agents';
import { fuzzyMatch } from '../services/palette/fuzzy-match';
import { useUiStore } from '../store/ui-store';
import { resolveAgentIcon } from './icons';
import { Popover } from './popover';
import { Tooltip } from './tooltip';

/**
 * Dropdown trigger in the titlebar showing the SVG logo of the currently active
 * primary agent, and allowing the user to select/set the primary agent from
 * the searchable dropdown list.
 */
export function TitleBarPrimaryAgent() {
  const [open, setOpen] = useState(false);
  const { agents } = useAgents();
  const primaryAgent = useUiStore((s) => s.primaryAgent);
  const setPrimaryAgent = useUiStore((s) => s.setPrimaryAgent);

  const activeAgent = agents.find((a) => a.id === primaryAgent) ?? agents[0];
  const ActiveIcon = activeAgent ? resolveAgentIcon(activeAgent) : resolveAgentIcon({ id: 'claude' });
  const label = activeAgent ? `Primary agent: ${activeAgent.label}` : 'Select primary agent';

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side="bottom"
      align="end"
      label={label}
      testId="titlebar-primary-agent"
      panelClassName="w-72"
      triggerClassName="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[open=true]:bg-accent cursor-pointer"
      trigger={
        <Tooltip label={label} side="bottom">
          <span className="flex items-center justify-center">
            <ActiveIcon
              aria-hidden
              className="h-3.5 w-3.5 shrink-0"
              style={activeAgent?.accent ? { color: activeAgent.accent } : undefined}
            />
          </span>
        </Tooltip>
      }
    >
      {open ? (
        <PrimaryAgentPickerPanel
          agents={agents}
          primaryAgent={primaryAgent}
          onSelect={(agentId) => {
            setPrimaryAgent(agentId);
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
  primaryAgent,
  onSelect,
}: {
  agents: AgentDefinition[];
  primaryAgent: string;
  onSelect: (agentId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
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

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (flatAgents.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((current) => (current + 1) % flatAgents.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((current) => (current - 1 + flatAgents.length) % flatAgents.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const target = flatAgents[highlighted];
      if (target) {
        onSelect(target.id);
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
        className="max-h-80 overflow-auto p-1"
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

                return (
                  <button
                    key={agent.id}
                    type="button"
                    role="menuitemradio"
                    tabIndex={-1}
                    aria-label={agent.label}
                    aria-checked={isSelected}
                    aria-selected={isHighlighted}
                    data-testid={`primary-agent-item-${agent.id}`}
                    onClick={() => onSelect(agent.id)}
                    onMouseEnter={() => setHighlighted(itemIndex)}
                    className={`flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors ${
                      isHighlighted ? 'bg-accent text-foreground' : 'text-foreground'
                    } ${isSelected ? 'font-medium' : ''}`}
                  >
                    <Icon
                      aria-hidden
                      className="h-4 w-4 shrink-0"
                      style={agent.accent ? { color: agent.accent } : undefined}
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
    </div>
  );
}
