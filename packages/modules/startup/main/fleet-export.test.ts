// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { computeFleetProjection, seedFleetCatalog, type FleetProjection } from '@midnite/studio-shared';

import { fleetProjectionCsv, majorUnits, renderFleetProjectionHtml, runwayCsv, safeFileName } from './fleet-export';
import type { RunwayProjection } from './runway';

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const projection = (nodeName = 'Node 1', horizon = 3): FleetProjection => ({
  id: u(1),
  name: 'Plan',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  globals: { scalePct: 100, electricityRateMinor: 15, demandGrowthPct: 0, horizonMonths: horizon, energyScalesWithUtilisation: false },
  template: { hardwareId: 'dual-4090', apiTierId: 'pro', quantity: 1, utilisationPct: 70, pricePerHourMinor: 150 },
  nodes: [{ id: u(2), name: nodeName, enabled: true, hardwareId: 'dual-4090', apiTierId: 'pro', quantity: 2, utilisationPct: 70, pricePerHourMinor: 150 }],
});
const csv = (p: FleetProjection, currency = 'USD') => {
  const cat = seedFleetCatalog(currency);
  return fleetProjectionCsv(p, computeFleetProjection(p, cat), cat, currency);
};

describe('fleetProjectionCsv', () => {
  it('has a BOM, CRLF line ends and the two sections', () => {
    const out = csv(projection());
    expect(out.startsWith('﻿month,energy,api,opex,revenue,net,cumulative\r\n')).toBe(true);
    expect(out.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    const [series, nodes] = out.slice(1).split('\r\n\r\n');
    expect(series!.split('\r\n')).toHaveLength(4);
    expect(nodes!.startsWith('node,hardware,api tier,quantity,utilisation %,price per hour,capex,opex,net\r\n')).toBe(true);
  });
  it('prints decimal major units', () => {
    const lines = csv(projection()).slice(1).split('\r\n');
    // 2 x Dual 4090 at USD 6500 each; energy 1.2 kW x 730 h x 0.15 x 2 = 262.80; API 2 x 499
    expect(lines[1]).toBe('1,262.80,998.00,1260.80,1533.00,272.20,-12727.80');
    expect(lines[6]).toBe('Node 1,Dual RTX 4090 server,Pro,2,70,1.50,13000.00,1260.80,272.20');
  });
  it('quotes a node named Node, "A"', () => {
    expect(csv(projection('Node, "A"'))).toContain('"Node, ""A""",Dual RTX 4090 server');
  });
  it('neutralises formula-looking text cells but leaves amounts raw', () => {
    expect(csv(projection('=HYPERLINK("x")'))).toContain(`"'=HYPERLINK(""x"")",Dual RTX 4090 server`);
    expect(csv(projection('-foo'))).toContain("'-foo,Dual RTX 4090 server");
    expect(csv(projection()).slice(1).split('\r\n')[1]).toContain(',-12727.80');
    expect(majorUnits(-12300, 'USD')).toBe('-123.00');
  });
  it('JPY has no decimals', () => {
    expect(majorUnits(1234, 'JPY')).toBe('1234');
    expect(majorUnits(1234, 'USD')).toBe('12.34');
    expect(majorUnits(-5, 'USD')).toBe('-0.05');
    expect(csv(projection(), 'JPY').slice(1).split('\r\n')[1]).not.toMatch(/\./);
  });
});

describe('runwayCsv', () => {
  it('writes one row per month', () => {
    const r: RunwayProjection = {
      months: [
        { month: '2026-11', revenueMinor: 1000, costMinor: 250, netMinor: 750, cashMinor: 10750 },
        { month: '2026-12', revenueMinor: 0, costMinor: 500, netMinor: -500, cashMinor: 10250 },
      ],
      burnMinor: 0, runwayMonths: null, zeroCashMonth: null, defaultAlive: true,
    };
    expect(runwayCsv(r, 'USD')).toBe('﻿month,revenue,costs,net,cash\r\n2026-11,10.00,2.50,7.50,107.50\r\n2026-12,0.00,5.00,-5.00,102.50\r\n');
  });
});

describe('renderFleetProjectionHtml', () => {
  const html = () => {
    const p = projection('<b>x</b>', 12);
    const cat = seedFleetCatalog('USD');
    return renderFleetProjectionHtml(p, computeFleetProjection(p, cat), cat, 'USD', null, '2026-11-12');
  };
  it('is script-less and makes no request', () => {
    const h = html();
    expect(h).not.toContain('<script');
    expect(h).not.toContain('http');
    expect(h).toContain('<svg');
  });
  it('escapes user text and shows the KPIs', () => {
    const h = html();
    expect(h).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(h).toContain('Net margin /mo');
    expect(h).toContain('@page{size:A4 landscape');
  });
});

describe('safeFileName', () => {
  it('keeps only word characters, spaces, dots and dashes', () => {
    expect(safeFileName('a/b: c?.v2', 'x')).toBe('ab c.v2');
    expect(safeFileName('///', 'projection')).toBe('projection');
  });
});
