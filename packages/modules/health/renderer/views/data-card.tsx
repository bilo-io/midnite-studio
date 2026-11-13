import { useQueryClient } from '@tanstack/react-query';

import { useFrameChrome } from '@midnite/studio-frame';

import { monthKeyOffset } from '../data/dates';
import { healthBridge, usePlans, useMonths } from '../data/use-health';
import { HEALTH_DATA_HINT } from '../health-manifest';

/** "Your data" — where Health keeps everything, plus Export and Erase. Nothing here leaves the Mac. */
export function DataCard() {
  const client = useQueryClient();
  const dialogs = useFrameChrome().useDialogs();
  const now = new Date();
  const months = useMonths(monthKeyOffset(now, -35), monthKeyOffset(now, 0));
  const plans = usePlans();

  const fail = (what: string) => dialogs.notify({ title: `Couldn't ${what}`, body: 'Nothing was changed. Try again.' });

  const exportAll = async () => {
    const res = await healthBridge()?.exportAll();
    if (res === undefined || !res.ok) return fail('export');
    const value = (res as { value?: { path?: string } }).value;
    if (value?.path !== undefined) dialogs.notify({ title: 'Exported', body: 'Your Health data was saved to the file you chose.' });
  };

  const erase = () => {
    const monthIds = (months.data?.months ?? []).map((m) => `${m.id}.json`);
    const planCount = plans.data?.plans?.length ?? 0;
    dialogs.confirm({
      title: 'Erase all Health data?',
      body: 'Your profile, every log, every food and every plan move to the Trash. You can restore the folder from the Trash in Finder.',
      confirmLabel: 'Move to Trash',
      danger: true,
      blastRadius: { count: monthIds.length + planCount + 2, sample: ['profile.json', 'foods.json', ...monthIds.slice(0, 3)].map((name) => ({ sha: '', subject: name })) },
      blastRadiusKind: 'files',
      onConfirm: async () => {
        dialogs.close();
        const res = await healthBridge()?.eraseAll();
        if (res === undefined || !res.ok) return fail('erase');
        await client.invalidateQueries({ queryKey: ['health'] });
      },
    });
  };

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border p-4" aria-label="Your data" data-testid="data-card">
      <h3 className="text-sm font-semibold">Your data</h3>
      <p className="text-xs opacity-70">Everything Health stores is on this Mac, in {HEALTH_DATA_HINT}.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded px-3 py-1.5 text-xs hover:bg-accent" onClick={() => void exportAll()}>
          Export…
        </button>
        <button type="button" className="rounded px-3 py-1.5 text-xs text-destructive hover:bg-accent" onClick={erase}>
          Erase all Health data…
        </button>
      </div>
    </section>
  );
}
