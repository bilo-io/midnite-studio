import { useQuery } from '@tanstack/react-query';

import { Accordion } from '@bilo-io/ui';
import { LuBot, LuSquareTerminal } from 'react-icons/lu';

import { BUILTIN_AGENTS, type AgentDefinition } from '@midnite/git-shared';

import { bridge, hasBridge } from '../../../services/bridge';
import { useUiStore, type TerminalSidebarSide } from '../../../store/ui-store';
import { Choice, Field } from './controls';

/**
 * Terminal preferences — the knobs that exist today, deliberately decoupled
 * from Phase 15's still-open themes: this page hosts whatever terminal
 * settings are real at build time and grows as that phase lands more.
 */
export function TerminalPage() {
  const side = useUiStore((s) => s.terminalSidebarSide);
  const setSide = useUiStore((s) => s.setTerminalSidebarSide);
  const { data } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => (await bridge()?.agent.list())?.agents ?? [...BUILTIN_AGENTS],
    enabled: hasBridge(),
  });
  const agents: AgentDefinition[] = data ?? [...BUILTIN_AGENTS];

  return (
    <div className="flex flex-col gap-3">
      <Accordion title="General" icon={<LuSquareTerminal className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <Choice<TerminalSidebarSide>
            label="Session list"
            hint="Which edge of the terminal pane the session sidebar docks to."
            value={side}
            onChange={setSide}
            options={[
              ['left', 'Left'],
              ['right', 'Right'],
            ]}
          />

          <Field
            label="Keybinding"
            hint="The toggle chord is fixed — macOS reserves Cmd+` for window cycling."
          >
            <code className="w-fit rounded bg-muted px-1.5 py-0.5 font-mono text-xs">Ctrl+`</code>
          </Field>
        </div>
      </Accordion>

      <Accordion
        title="Agents"
        icon={<LuBot className="h-4 w-4" />}
        count={agents.length}
        defaultOpen
      >
        <div className="p-3">
          <Field
            label="Agent roster"
            hint="Built-in agents merged with your agents.json override (userData). Edit the file, not this list — it reloads on next launch."
          >
            <ul className="flex flex-col gap-1">
              {agents.map((agent) => (
                <li
                  key={agent.id}
                  className="flex items-center gap-2 rounded border border-border px-2 py-1.5 text-xs"
                >
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: agent.accent }}
                  />
                  <span className="font-medium">{agent.label}</span>
                  <code
                    className="ml-auto rounded bg-muted px-1 py-0.5 font-mono text-[10px]"
                    data-selectable
                  >
                    {[agent.command, ...agent.args].join(' ')}
                  </code>
                </li>
              ))}
            </ul>
          </Field>
        </div>
      </Accordion>
    </div>
  );
}
