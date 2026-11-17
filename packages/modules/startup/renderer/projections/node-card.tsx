import { useEffect, useState } from 'react';
import { LuTrash2 } from 'react-icons/lu';

import type { FleetNode, FleetNodeConfig, FleetProjection } from '@midnite/studio-shared';

import { STARTUP_CHROME } from '../compose/startup-chrome';
import { ConfigSliders, TemplateSelects } from './controls-panel';
import type { FleetNodeFigures } from './fleet-model';
import { formatZar } from './format-zar';
import { ALERT, FIELD, LABEL, PANE } from './styles';

type Update = (fn: (p: FleetProjection) => FleetProjection) => void;

const KEYS = ['hardwareId', 'apiTierId', 'quantity', 'utilisationPct', 'pricePerHourMinor'] as const;
export const differsFromTemplate = (node: FleetNode, template: FleetNodeConfig) => KEYS.some((k) => node[k] !== template[k]);

/** One node of the fleet: its own name, on/off switch, config overrides and month-0 figures. */
export function NodeCard({ node, template, figures, update, readOnly }: { node: FleetNode; template: FleetNodeConfig; figures: FleetNodeFigures | undefined; update: Update; readOnly: boolean }) {
  const IconButton = STARTUP_CHROME.IconButton;
  const [name, setName] = useState(node.name);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => setName(node.name), [node.name]);
  const change = (patch: Partial<FleetNode>) => update((p) => ({ ...p, nodes: p.nodes.map((n) => (n.id === node.id ? { ...n, ...patch } : n)) }));
  const f = node.enabled && figures !== undefined ? figures : { capex: 0, opex: 0, revenue: 0, net: 0 };

  function commitName(): void {
    const next = name.trim();
    if (next.length < 1 || next.length > 60) {
      setProblem('Name must be 1–60 characters');
      return;
    }
    setProblem(null);
    if (next !== node.name) change({ name: next });
  }

  return (
    <article aria-label={node.name} className={`flex flex-col gap-3 p-3 ${PANE} ${node.enabled ? '' : 'opacity-50'}`}>
      <header className="flex items-center gap-2">
        {differsFromTemplate(node, template) ? <span title="Differs from the template" aria-label="Differs from the template" className="h-1.5 w-1.5 shrink-0 rounded-full bg-pink-500" /> : null}
        <input aria-label="Node name" className={`${FIELD} min-w-0 flex-1`} value={name} disabled={readOnly} onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === 'Enter' && commitName()} />
        <button type="button" role="switch" aria-checked={node.enabled} aria-label="Enabled" disabled={readOnly} onClick={() => change({ enabled: !node.enabled })} className={`h-5 w-9 shrink-0 rounded-full border border-border p-0.5 transition-colors disabled:opacity-50 ${node.enabled ? 'bg-purple-500' : 'bg-muted'}`}>
          <span className={`block h-3.5 w-3.5 rounded-full bg-white transition-transform ${node.enabled ? 'translate-x-4' : ''}`} />
        </button>
        <IconButton icon={LuTrash2} label="Remove node" disabled={readOnly} onClick={() => update((p) => ({ ...p, nodes: p.nodes.filter((n) => n.id !== node.id) }))} />
      </header>
      {problem !== null ? (
        <p role="alert" className={ALERT}>
          {problem}
        </p>
      ) : null}
      <TemplateSelects compact idPrefix={node.id} value={node} disabled={readOnly} onChange={change} />
      <ConfigSliders idPrefix={node.id} value={node} disabled={readOnly} onChange={change} />
      <dl className="grid grid-cols-3 gap-2 text-xs">
        {(
          [
            ['CapEx', f.capex],
            ['OpEx /mo', f.opex],
            ['Net /mo', f.net],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dt className={LABEL}>{label}</dt>
            <dd className={`tabular-nums ${label === 'Net /mo' ? (value >= 0 ? 'text-success' : 'text-destructive') : ''}`}>{formatZar(value)}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
