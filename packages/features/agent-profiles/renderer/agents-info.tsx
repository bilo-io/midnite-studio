import { LuCheck, LuMinus } from 'react-icons/lu';

import type { IconComponent } from '@midnite/studio-frame';
import { AGENT_BLUEPRINT_STAGES, enforcementFor, promptDeliveryFor, type PromptDelivery } from '@midnite/studio-shared';

import { optionIcon, STAGE_ICONS } from './blueprint-icons';
import { useAgentProfilesHost } from './host';
import { GLOSSARY } from './info-copy';
import { FOCUS_RING, SECONDARY_BUTTON } from './ui';

const SECTIONS = [
  { id: 'info-stages', label: 'The five stages' },
  { id: 'info-how', label: 'How a custom agent runs' },
  { id: 'info-glossary', label: 'Glossary' },
  { id: 'info-links', label: 'Links' },
] as const;

const DELIVERY_COPY: Record<PromptDelivery, string> = {
  flag: 'Passed with a command-line flag, read from a file.',
  argument: 'Passed as the opening argument, read from a file.',
  none: 'Not delivered: this CLI has no way to take a system prompt.',
};

function YesNo({ yes }: { yes: boolean }) {
  return yes ? (
    <span className="inline-flex items-center text-success">
      <LuCheck aria-hidden className="h-3.5 w-3.5" />
      <span className="sr-only">Enforced</span>
    </span>
  ) : (
    <span className="inline-flex items-center text-muted-foreground">
      <LuMinus aria-hidden className="h-3.5 w-3.5" />
      <span className="sr-only">Not enforced</span>
    </span>
  );
}

function AgentCell({ Icon, label }: { Icon: IconComponent; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function DocsLink({ url, label }: { url: string; label: string }) {
  const { openExternal } = useAgentProfilesHost();
  return (
    <button type="button" className={`rounded text-primary underline-offset-2 hover:underline ${FOCUS_RING}`} onClick={() => openExternal(url)}>
      {label}
    </button>
  );
}

const TH = 'border-b border-border py-1 text-left text-[11px] font-medium text-muted-foreground';
const TD = 'border-b border-border/60 py-1.5 pr-3 align-top';

/** The Info tab: what the five stages are, how a custom agent runs, a glossary and the docs links. */
export function AgentsInfo() {
  const host = useAgentProfilesHost();
  const { agents } = host.useAgentRoster();
  const glossary = [...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term));

  return (
    <div className="mx-auto max-w-3xl space-y-8 text-xs leading-relaxed" data-testid="agents-info">
      <nav aria-label="On this page" className="flex flex-wrap gap-2">
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            className={SECONDARY_BUTTON}
            onClick={() => document.getElementById(section.id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })}
          >
            {section.label}
          </button>
        ))}
      </nav>

      <section aria-labelledby="info-stages-h" className="space-y-3">
        <h2 id="info-stages" className="scroll-mt-4 text-sm font-semibold">
          <span id="info-stages-h">The five stages</span>
        </h2>
        <p className="text-muted-foreground">
          An agent&apos;s blueprint records your design choices across five stages. It is a set of notes for you, and it does not change how the CLI runs.
        </p>
        {AGENT_BLUEPRINT_STAGES.map((stage) => {
          const StageIcon = STAGE_ICONS[stage.id];
          return (
            <div key={stage.id} data-testid={`info-stage-${stage.id}`} className="rounded-md border border-border p-3">
              <div className="mb-1 flex items-center gap-2">
                <StageIcon className="h-4 w-4" />
                <h3 className="text-xs font-semibold">{stage.label}</h3>
                <span className="text-[11px] text-muted-foreground">{stage.subtitle}</span>
              </div>
              <p className="mb-2 text-muted-foreground">{stage.summary}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                {stage.options.map((option) => {
                  const OptionIcon = optionIcon(option.id);
                  return (
                    <div key={option.id} className="contents" data-testid={`info-option-${option.id}`}>
                      <dt className="flex items-start gap-1.5 font-medium">
                        <OptionIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {option.label}
                      </dt>
                      <dd className="text-muted-foreground">
                        {option.summary}{' '}
                        {option.docsUrl ? <DocsLink url={option.docsUrl} label="Docs ↗" /> : null}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          );
        })}
      </section>

      <section aria-labelledby="info-how-h" className="space-y-3">
        <h2 id="info-how" className="scroll-mt-4 text-sm font-semibold">
          <span id="info-how-h">How a custom agent runs</span>
        </h2>
        <p>
          A custom agent is one of your installed CLIs, started with the model you picked (passed as that CLI&apos;s own model flag, or left to its
          default) and the system prompt you wrote.
        </p>
        <h3 className="text-xs font-semibold">How the prompt is delivered</h3>
        <table className="w-full border-collapse text-xs" data-testid="info-delivery">
          <thead>
            <tr>
              <th className={TH}>CLI</th>
              <th className={TH}>System prompt</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => (
              <tr key={agent.id} data-testid={`info-delivery-${agent.id}`}>
                <td className={TD}>
                  <AgentCell Icon={host.resolveAgentIcon(agent)} label={agent.label} />
                </td>
                <td className={TD}>{DELIVERY_COPY[promptDeliveryFor(agent.id)]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3 className="text-xs font-semibold">What is enforced</h3>
        <table className="w-full border-collapse text-xs" data-testid="info-enforcement">
          <thead>
            <tr>
              <th className={TH}>CLI</th>
              <th className={TH}>Tool restriction</th>
              <th className={TH}>Tool-call limit</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => {
              const enforced = enforcementFor(agent.id);
              return (
                <tr key={agent.id} data-testid={`info-enforcement-${agent.id}`}>
                  <td className={TD}>
                    <AgentCell Icon={host.resolveAgentIcon(agent)} label={agent.label} />
                  </td>
                  <td className={TD}>
                    <YesNo yes={enforced.tools} />
                  </td>
                  <td className={TD}>
                    <YesNo yes={enforced.toolCallLimit} />
                  </td>
                </tr>
              );
            })}
            <tr>
              <td className={TD} colSpan={3}>
                The other limits apply to every CLI.
              </td>
            </tr>
          </tbody>
        </table>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Restricting tools hides your other MCP servers from that agent&apos;s sessions.</li>
          <li>Skills and the blueprint are guidance only: they are written into the prompt or kept as notes, and nothing enforces them.</li>
          <li>Edits apply to new sessions, and limits within a few seconds.</li>
        </ul>
      </section>

      <section aria-labelledby="info-glossary-h" className="space-y-3">
        <h2 id="info-glossary" className="scroll-mt-4 text-sm font-semibold">
          <span id="info-glossary-h">Glossary</span>
        </h2>
        <dl className="grid gap-x-6 gap-y-3 min-[720px]:grid-cols-2" data-testid="info-glossary-list">
          {glossary.map((entry) => (
            <div key={entry.term}>
              <dt className="font-medium">{entry.term}</dt>
              <dd className="text-muted-foreground">{entry.definition}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="info-links-h" className="space-y-3">
        <h2 id="info-links" className="scroll-mt-4 text-sm font-semibold">
          <span id="info-links-h">Links</span>
        </h2>
        <ul className="space-y-1">
          {agents
            .filter((agent) => agent.docsUrl)
            .map((agent) => (
              <li key={agent.id}>
                <DocsLink url={agent.docsUrl as string} label={`${agent.label} docs`} />
              </li>
            ))}
          {AGENT_BLUEPRINT_STAGES.flatMap((stage) => stage.options)
            .filter((option) => option.docsUrl)
            .map((option) => (
              <li key={option.id}>
                <DocsLink url={option.docsUrl as string} label={`${option.label} docs`} />
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
