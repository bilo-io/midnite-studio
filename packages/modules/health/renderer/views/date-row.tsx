import { LuChevronLeft, LuChevronRight } from 'react-icons/lu';

import { useFrameChrome } from '@midnite/studio-frame';

import { shiftDate, todayKey } from '../data/dates';

/** The day picker both logs share: `‹ date ›`, no future dates. */
export function DateRow({ date, onChange }: { date: string; onChange: (date: string) => void }) {
  const { IconButton } = useFrameChrome();
  const today = todayKey();
  return (
    <div className="flex items-center gap-2" data-testid="date-row">
      <IconButton icon={LuChevronLeft} label="Previous day" onClick={() => onChange(shiftDate(date, -1))} />
      <span className="min-w-[8rem] text-center text-sm font-medium">{date === today ? `Today · ${date}` : date}</span>
      <IconButton icon={LuChevronRight} label="Next day" disabled={date >= today} onClick={() => onChange(shiftDate(date, 1))} />
    </div>
  );
}
