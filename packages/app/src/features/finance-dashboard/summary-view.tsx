import {
  LuActivity,
  LuArrowDownToLine,
  LuChartLine,
  LuChartNoAxesColumn,
  LuFlame,
  LuMinus,
  LuRuler,
  LuTarget,
  LuTrendingDown,
  LuTrendingUp,
  LuZap,
} from 'react-icons/lu';

import type { IconComponent } from '../../components/icon-button';
import type { DescribedSummary, SummaryIcon, SummaryLine, SummaryTone } from './series-summary';

/**
 * Renders a {@link DescribedSummary}: a headline and a short list of findings,
 * each with a glyph and a green / red / neutral tone. Pure presentation — every
 * word comes from `describeSummary`, which is a deterministic function of the
 * candles on screen; there is no model behind any of this text.
 */
const ICONS: Record<SummaryIcon, IconComponent> = {
  'trend-up': LuTrendingUp,
  'trend-down': LuTrendingDown,
  flat: LuMinus,
  range: LuRuler,
  volatility: LuActivity,
  drawdown: LuArrowDownToLine,
  average: LuChartLine,
  move: LuZap,
  streak: LuFlame,
  position: LuTarget,
  bars: LuChartNoAxesColumn,
};

const TONE_TEXT: Record<SummaryTone, string> = {
  up: 'text-success',
  down: 'text-destructive',
  neutral: 'text-muted-foreground',
};

export function SummaryHeadline({ summary }: { summary: DescribedSummary }) {
  const Icon = summary.tone === 'up' ? LuTrendingUp : summary.tone === 'down' ? LuTrendingDown : LuMinus;
  return (
    <p data-testid="summary-headline" data-tone={summary.tone} className="flex items-start gap-1.5 text-[13px] font-medium leading-snug">
      <Icon aria-hidden className={`mt-0.5 size-4 shrink-0 ${TONE_TEXT[summary.tone]}`} />
      <span>{summary.headline}</span>
    </p>
  );
}

export function SummaryLines({ lines, columns = 1 }: { lines: readonly SummaryLine[]; columns?: 1 | 2 }) {
  return (
    <ul className={`grid gap-x-4 gap-y-1.5 ${columns === 2 ? 'sm:grid-cols-2' : ''}`}>
      {lines.map((line) => {
        const Icon = ICONS[line.icon];
        return (
          <li key={line.id} data-summary={line.id} data-tone={line.tone} className="flex items-start gap-2 text-xs leading-snug">
            <Icon aria-hidden className={`mt-0.5 size-3.5 shrink-0 ${TONE_TEXT[line.tone]}`} />
            <span>
              <span className="font-medium">{line.label}</span>
              <span className="text-muted-foreground"> — </span>
              <span className={line.tone === 'neutral' ? 'text-muted-foreground' : TONE_TEXT[line.tone]}>{line.text}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
