import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { FleetProjectionResult } from './fleet-model';
import { formatCompactZar, formatZar } from './format-zar';

/** Stacked monthly costs, monthly revenue and cumulative cash. Animation is off: a slider drag must not replay it. */
export default function FleetChart({ result, horizon }: { result: FleetProjectionResult; horizon: number }) {
  const { series, paybackMonths } = result;
  return (
    <div role="img" aria-label={`Monthly costs, revenue and cumulative cash over ${horizon} months`}>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={series}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="month" tickFormatter={(m: number) => `M${m + 1}`} tick={{ fontSize: 11 }} />
          <YAxis yAxisId="monthly" tickFormatter={(v: number) => formatCompactZar(v)} tick={{ fontSize: 11 }} width={64} />
          <YAxis yAxisId="cumulative" orientation="right" tickFormatter={(v: number) => formatCompactZar(v)} tick={{ fontSize: 11 }} width={64} />
          <Tooltip formatter={(v) => formatZar(Number(v))} labelFormatter={(m) => `Month ${Number(m) + 1}`} />
          <Legend />
          <Area isAnimationActive={false} type="monotone" yAxisId="monthly" dataKey="energy" name="Energy" stackId="cost" stroke="#6366f1" fill="#6366f1" fillOpacity={0.5} />
          <Area isAnimationActive={false} type="monotone" yAxisId="monthly" dataKey="api" name="API" stackId="cost" stroke="#a855f7" fill="#a855f7" fillOpacity={0.5} />
          <Area isAnimationActive={false} type="monotone" yAxisId="monthly" dataKey="revenue" name="Revenue" stroke="#ec4899" fill="#ec4899" fillOpacity={0.15} />
          <Line isAnimationActive={false} type="monotone" yAxisId="cumulative" dataKey="cumulative" name="Cumulative cash" stroke="hsl(var(--foreground))" strokeWidth={2} dot={false} />
          <ReferenceLine yAxisId="cumulative" y={0} stroke="hsl(var(--muted-foreground))" />
          {paybackMonths !== null ? <ReferenceLine yAxisId="cumulative" x={paybackMonths - 1} stroke="#ec4899" strokeDasharray="4 2" label={{ value: 'Payback', fontSize: 11, fill: 'hsl(var(--foreground))' }} /> : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
