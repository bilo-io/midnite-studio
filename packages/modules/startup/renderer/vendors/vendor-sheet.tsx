import { useState, type FormEvent } from 'react';

import { PLAN_CATEGORIES, type Vendor } from '@midnite/studio-shared';

import { useStartupWrite } from '../data/use-startup';

const FIELD = 'h-8 w-full rounded-md border border-border bg-background px-2 text-sm';
const LABEL = 'flex flex-col gap-1 text-xs font-medium text-muted-foreground';

/** Add or edit one vendor. Removing one that a contract still uses is refused by main, and its message shows here. */
export function VendorSheet({ vendor, onClose }: { vendor: Vendor | null; onClose: () => void }) {
  const save = useStartupWrite((bridge, next: Vendor) => bridge.upsertVendor({ vendor: next }));
  const remove = useStartupWrite((bridge, id: string) => bridge.removeVendor({ id }));
  const [id] = useState(() => vendor?.id ?? crypto.randomUUID());
  const [name, setName] = useState(vendor?.name ?? '');
  const [category, setCategory] = useState<Vendor['category']>(vendor?.category ?? 'software');
  const [website, setWebsite] = useState(vendor?.website ?? '');
  const [contact, setContact] = useState(vendor?.contact ?? '');
  const [notes, setNotes] = useState(vendor?.notes ?? '');
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (name.trim() === '') return setProblem('Give the vendor a name.');
    if (website.trim() !== '' && !URL.canParse(website.trim())) return setProblem('The website must be a full address, such as https://example.com.');
    setProblem(null);
    save.mutate(
      { id, name: name.trim(), category, ...(website.trim() !== '' ? { website: website.trim() } : {}), ...(contact.trim() !== '' ? { contact: contact.trim() } : {}), notes },
      { onSuccess: onClose, onError: (e) => setProblem(e.message) },
    );
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border p-4" aria-label={vendor === null ? 'Add vendor' : 'Edit vendor'}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{vendor === null ? 'Add vendor' : 'Edit vendor'}</h2>
        <label className={LABEL}>
          Name
          <input className={FIELD} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className={LABEL}>
          Category
          <select className={FIELD} value={category} onChange={(e) => setCategory(e.target.value as Vendor['category'])}>
            {PLAN_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          Website
          <input className={FIELD} value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
        <label className={LABEL}>
          Contact
          <input className={FIELD} value={contact} maxLength={200} onChange={(e) => setContact(e.target.value)} />
        </label>
        <label className={LABEL}>
          Notes
          <textarea className={`${FIELD} h-16 py-1`} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {problem !== null ? (
          <p role="alert" className="text-xs text-red-500">
            {problem}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button type="submit" disabled={save.isPending} className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
            Save
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-md border border-border px-3 text-sm">
            Cancel
          </button>
          {vendor !== null ? (
            <button type="button" onClick={() => remove.mutate(vendor.id, { onSuccess: onClose, onError: (e) => setProblem(e.message) })} className="ml-auto h-8 rounded-md px-3 text-sm text-red-500">
              Remove
            </button>
          ) : null}
        </div>
      </form>
    </aside>
  );
}
