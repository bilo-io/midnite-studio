import { useState } from 'react';
import { LuCheck } from 'react-icons/lu';

import { useAgents } from '../features/terminal/use-agents';
import { useUiStore } from '../store/ui-store';
import { resolveAgentIcon } from './icons';
import { Popover } from './popover';
import { Tooltip } from './tooltip';

/**
 * Dropdown trigger in the titlebar showing the SVG logo of the currently active
 * primary agent, and allowing the user to select/set the primary agent from
 * the dropdown list.
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
      panelClassName="w-48 p-1.5 flex flex-col gap-0.5"
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
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground select-none">
        Primary Agent
      </div>
      <div role="menu" aria-label="Select primary agent" className="flex flex-col gap-0.5">
        {agents.map((agent) => {
          const Icon = resolveAgentIcon(agent);
          const isSelected = agent.id === primaryAgent;
          return (
            <button
              key={agent.id}
              type="button"
              role="menuitemradio"
              aria-label={agent.label}
              aria-checked={isSelected}
              data-testid={`primary-agent-item-${agent.id}`}
              onClick={() => {
                setPrimaryAgent(agent.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors ${
                isSelected
                  ? 'bg-accent/70 font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <Icon
                aria-hidden
                className="h-3.5 w-3.5 shrink-0"
                style={agent.accent ? { color: agent.accent } : undefined}
              />
              <span className="flex-1 text-left truncate">{agent.label}</span>
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
    </Popover>
  );
}
