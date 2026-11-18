import { useState } from 'react';
import { LuFileDown, LuFileSpreadsheet } from 'react-icons/lu';

import { STARTUP_CHROME } from '../compose/startup-chrome';
import { useStartupWrite } from '../data/use-startup';
import { ALERT } from './styles';

/**
 * The results header's Export pair: the saved projection as a CSV or a one-page PDF, written in main through the
 * native save dialog. A cancelled dialog and a success both show nothing; a failure shows inline.
 */
export function ExportButtons({ projectionId, readOnly = false }: { projectionId: string; readOnly?: boolean }) {
  const IconButton = STARTUP_CHROME.IconButton;
  const [problem, setProblem] = useState<string | null>(null);
  const csv = useStartupWrite((bridge, id: string) => bridge.exportFleetProjectionCsv({ projectionId: id }));
  const pdf = useStartupWrite((bridge, id: string) => bridge.exportFleetProjectionPdf({ projectionId: id }));
  const run = (m: typeof csv): void => {
    setProblem(null);
    m.mutate(projectionId, { onError: (e) => setProblem(e.message) });
  };
  return (
    <span className="flex items-center gap-1">
      <IconButton icon={LuFileSpreadsheet} label="Export CSV" disabled={readOnly || csv.isPending} onClick={() => run(csv)} />
      <IconButton icon={LuFileDown} label="Export PDF" disabled={readOnly || pdf.isPending} onClick={() => run(pdf)} />
      {problem !== null ? (
        <p role="alert" className={ALERT}>
          {problem}
        </p>
      ) : null}
    </span>
  );
}
