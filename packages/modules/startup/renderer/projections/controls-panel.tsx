import { MAX_FLEET_NODES, minorExponent, type FleetApiTier, type FleetHardware, type FleetNodeConfig, type FleetProjection } from '@midnite/studio-shared';

import { STARTUP_CHROME } from '../compose/startup-chrome';
import { formatCompactMoney, formatMoney } from './format-money';
import { useMoney } from './money-context';
import { SliderField, parseNumber } from './slider-field';
import { BUTTON, BUTTON_PRIMARY, FIELD, GRADIENT, LABEL } from './styles';

type Update = (fn: (p: FleetProjection) => FleetProjection) => void;

const HORIZONS = [12, 24, 36] as const;

export const hardwareOptionLabel = (h: FleetHardware, currency: string) => `${h.label} — ${formatMoney(h.priceMinor, currency)} · ${h.watts.toLocaleString('en-US')} W`;
export const apiOptionLabel = (t: FleetApiTier, currency: string) => `${t.label} — ${formatMoney(t.monthlyMinor, currency)} /mo`;

const fmtPct = (v: number) => `${v} %`;
const fmtRate = (currency: string) => (v: number) => `${formatMoney(v, currency, { decimals: 2 })} /kWh`;
const fmtGrowth = (v: number) => `${v > 0 ? '+' : ''}${v} %/mo`;
const fmtHour = (currency: string) => (v: number) => `${formatMoney(v, currency, { decimals: 2 })} /h`;
const fmtInt = (v: number) => String(v);
// A money field is typed in major units, held in minor units.
const parseMinor = (currency: string) => (t: string) => {
  const n = parseNumber(t);
  return n === null ? null : Math.round(n * 10 ** minorExponent(currency));
};

/** The next free `Node <n>`: one past the highest existing suffix. */
export function nextNodeName(names: readonly string[]): string {
  let max = 0;
  for (const n of names) {
    const m = /^Node (\d+)$/.exec(n);
    if (m !== null) max = Math.max(max, Number(m[1]));
  }
  return `Node ${max + 1}`;
}

export function TemplateSelects({ value, onChange, disabled, idPrefix, compact = false }: {
  compact?: boolean; value: FleetNodeConfig; onChange: (change: Partial<FleetNodeConfig>) => void; disabled: boolean; idPrefix: string }) {
  const { currency, catalog } = useMoney();
  return (
    <>
      <label className="flex flex-col gap-1">
        <span className={LABEL}>Hardware</span>
        <select aria-label="Hardware" id={`${idPrefix}-hw`} className={FIELD} disabled={disabled} value={value.hardwareId} onChange={(e) => onChange({ hardwareId: e.target.value })}>
          {catalog.hardware.some((h) => h.id === value.hardwareId) ? null : <option value={value.hardwareId}>{`Missing (${value.hardwareId})`}</option>}
          {catalog.hardware.filter((h) => !h.hidden || h.id === value.hardwareId).map((h) => (
            <option key={h.id} value={h.id}>
              {(compact ? `${h.label} · ${formatCompactMoney(h.priceMinor, currency)} · ${h.watts.toLocaleString('en-US')} W` : hardwareOptionLabel(h, currency)) + (h.hidden ? ' (hidden)' : '')}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={LABEL}>API tier</span>
        <select aria-label="API tier" id={`${idPrefix}-api`} className={FIELD} disabled={disabled} value={value.apiTierId} onChange={(e) => onChange({ apiTierId: e.target.value })}>
          {catalog.apiTiers.some((t) => t.id === value.apiTierId) ? null : <option value={value.apiTierId}>{`Missing (${value.apiTierId})`}</option>}
          {catalog.apiTiers.filter((t) => !t.hidden || t.id === value.apiTierId).map((t) => (
            <option key={t.id} value={t.id}>
              {apiOptionLabel(t, currency) + (t.hidden ? ' (hidden)' : '')}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

export function ConfigSliders({ value, onChange, disabled, idPrefix }: { value: FleetNodeConfig; onChange: (change: Partial<FleetNodeConfig>) => void; disabled: boolean; idPrefix: string }) {
  const { currency } = useMoney();
  return (
    <>
      <SliderField id={`${idPrefix}-qty`} label="Quantity" value={value.quantity} min={1} max={64} step={1} format={fmtInt} parse={parseNumber} disabled={disabled} onChange={(quantity) => onChange({ quantity })} />
      <SliderField id={`${idPrefix}-util`} label="Utilisation" value={value.utilisationPct} min={0} max={100} step={1} format={fmtPct} parse={parseNumber} disabled={disabled} onChange={(utilisationPct) => onChange({ utilisationPct })} />
      <SliderField id={`${idPrefix}-price`} label="Price per GPU-hour" value={value.pricePerHourMinor} min={0} max={1_000_000} step={50} format={fmtHour(currency)} parse={parseMinor(currency)} disabled={disabled} onChange={(pricePerHourMinor) => onChange({ pricePerHourMinor })} />
    </>
  );
}

/** The right pane: global assumptions, the master template, and the two actions that use it. Nothing collapses. */
export function ControlsPanel({ draft, update, readOnly }: { draft: FleetProjection; update: Update; readOnly: boolean }) {
  const { currency } = useMoney();
  const dialogs = STARTUP_CHROME.useDialogs();
  const { globals, template, nodes } = draft;
  const setGlobals = (change: Partial<FleetProjection['globals']>) => update((p) => ({ ...p, globals: { ...p.globals, ...change } }));
  const setTemplate = (change: Partial<FleetNodeConfig>) => update((p) => ({ ...p, template: { ...p.template, ...change } }));
  const atCap = nodes.length >= MAX_FLEET_NODES;

  function spawn(): void {
    update((p) => ({ ...p, nodes: [...p.nodes, { ...p.template, id: crypto.randomUUID(), name: nextNodeName(p.nodes.map((n) => n.name)), enabled: true }] }));
  }

  function applyAll(): void {
    dialogs.confirm({
      title: 'Apply the template to all nodes?',
      body: `Overwrites hardware, API tier, quantity, utilisation and price on ${nodes.length} nodes. Names and on/off stay.`,
      confirmLabel: `Apply to ${nodes.length} nodes`,
      danger: true,
      onConfirm: () => update((p) => ({ ...p, nodes: p.nodes.map((n) => ({ ...n, ...p.template })) })),
    });
  }

  return (
    <div className="flex flex-col gap-4 p-3">
      <section aria-labelledby="proj-global" className="flex flex-col gap-3">
        <h3 id="proj-global" className="text-sm font-semibold">
          Global
        </h3>
        <SliderField id="g-scale" label="Scale" value={globals.scalePct} min={10} max={500} step={10} format={fmtPct} parse={parseNumber} disabled={readOnly} onChange={(scalePct) => setGlobals({ scalePct })} />
        <SliderField id="g-rate" label="Electricity" value={globals.electricityRateMinor} min={0} max={10_000} step={10} format={fmtRate(currency)} parse={parseMinor(currency)} disabled={readOnly} onChange={(electricityRateMinor) => setGlobals({ electricityRateMinor })} />
        <SliderField id="g-growth" label="Demand growth" value={globals.demandGrowthPct} min={-20} max={50} step={1} format={fmtGrowth} parse={parseNumber} disabled={readOnly} onChange={(demandGrowthPct) => setGlobals({ demandGrowthPct })} />
        <div className="flex items-center justify-between gap-2">
          <span id="g-energy" className={LABEL}>
            Scale energy with utilisation
          </span>
          <button type="button" role="switch" aria-checked={globals.energyScalesWithUtilisation} aria-labelledby="g-energy" disabled={readOnly} onClick={() => setGlobals({ energyScalesWithUtilisation: !globals.energyScalesWithUtilisation })} className={`h-5 w-9 shrink-0 rounded-full border border-border p-0.5 transition-colors disabled:opacity-50 ${globals.energyScalesWithUtilisation ? 'bg-purple-500' : 'bg-muted'}`}>
            <span className={`block h-3.5 w-3.5 rounded-full bg-white transition-transform ${globals.energyScalesWithUtilisation ? 'translate-x-4' : ''}`} />
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <span id="g-horizon" className={LABEL}>
            Horizon (months)
          </span>
          <div role="radiogroup" aria-labelledby="g-horizon" className="flex gap-1">
            {HORIZONS.map((h) => (
              <button key={h} type="button" role="radio" aria-checked={globals.horizonMonths === h} disabled={readOnly} onClick={() => setGlobals({ horizonMonths: h })} className={`flex-1 rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50 ${globals.horizonMonths === h ? GRADIENT : 'hover:bg-accent'}`}>
                {h}
              </button>
            ))}
          </div>
        </div>
      </section>
      <section aria-labelledby="proj-template" className="flex flex-col gap-3">
        <h3 id="proj-template" className="text-sm font-semibold">
          Master template
        </h3>
        <TemplateSelects idPrefix="tpl" value={template} onChange={setTemplate} disabled={readOnly} />
        <ConfigSliders idPrefix="tpl" value={template} onChange={setTemplate} disabled={readOnly} />
        <div className="flex flex-col gap-2">
          <button type="button" className={BUTTON_PRIMARY} disabled={readOnly || atCap} title={atCap ? `A projection has at most ${MAX_FLEET_NODES} nodes.` : undefined} onClick={spawn}>
            Spawn node
          </button>
          <button type="button" className={BUTTON} disabled={readOnly || nodes.length === 0} onClick={applyAll}>
            Apply template to all
          </button>
        </div>
      </section>
      <p className="text-[11px] text-muted-foreground">Illustrative list prices — edit them in Settings ▸ Catalog.</p>
    </div>
  );
}
