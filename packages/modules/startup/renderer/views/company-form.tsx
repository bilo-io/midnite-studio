import { useState, type FormEvent } from 'react';

import { MARKET_CURRENCIES, type CompanyProfile } from '@midnite/studio-shared';

import { useStartupWrite } from '../data/use-startup';
import { fromMinor, toMinor } from '../money-input';

const FIELD = 'h-8 w-full rounded-md border border-border bg-background px-2 text-sm';
const LABEL = 'flex flex-col gap-1 text-xs font-medium text-muted-foreground';

const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * The company profile: first-run setup (`company === null`) and Settings ▸ Company. The currency is fixed once
 * the first invoice is issued, so main may refuse it with `locked` and the message is shown as it arrives.
 */
export function CompanyForm({ company, heading }: { company: CompanyProfile | null; heading: string }) {
  const save = useStartupWrite((bridge, next: CompanyProfile) => bridge.updateCompany({ company: next }));
  const [name, setName] = useState(company?.name ?? '');
  const [legalName, setLegalName] = useState(company?.legalName ?? '');
  const [currency, setCurrency] = useState(company?.currency ?? 'GBP');
  const [cash, setCash] = useState(company ? fromMinor(company.openingCash.minor, company.currency) : '0');
  const [asOf, setAsOf] = useState(company?.openingCash.asOf ?? today());
  const [address, setAddress] = useState(company?.address ?? '');
  const [taxId, setTaxId] = useState(company?.taxId ?? '');
  const [prefix, setPrefix] = useState(company?.invoicePrefix ?? 'INV-');
  const [terms, setTerms] = useState(String(company?.paymentTermsDays ?? 30));
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: FormEvent): void {
    event.preventDefault();
    const minor = toMinor(cash, currency);
    const days = Number(terms);
    if (name.trim() === '') return setProblem('Give the company a name.');
    if (minor === null) return setProblem('Opening cash must be a number.');
    if (!Number.isInteger(days) || days < 0 || days > 365) return setProblem('Payment terms are 0 to 365 days.');
    if (!/^[A-Z0-9-]{0,8}$/.test(prefix)) return setProblem('The invoice prefix is up to 8 capitals, digits or dashes.');
    setProblem(null);
    save.mutate({
      name: name.trim(),
      ...(legalName.trim() !== '' ? { legalName: legalName.trim() } : {}),
      currency,
      address,
      ...(taxId.trim() !== '' ? { taxId: taxId.trim() } : {}),
      invoicePrefix: prefix,
      paymentTermsDays: days,
      openingCash: { minor, asOf },
    });
  }

  const message = problem ?? save.error?.message ?? null;

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-xl flex-col gap-3 p-6" aria-label={heading}>
      <h2 className="text-xl font-semibold tracking-tight">{heading}</h2>
      <label className={LABEL}>
        Company name
        <input className={FIELD} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      </label>
      <label className={LABEL}>
        Legal name (optional)
        <input className={FIELD} value={legalName} onChange={(e) => setLegalName(e.target.value)} maxLength={120} />
      </label>
      <div className="grid grid-cols-3 gap-3">
        <label className={LABEL}>
          Currency
          <select className={FIELD} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {MARKET_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          Opening cash
          <input className={FIELD} inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} />
        </label>
        <label className={LABEL}>
          As of
          <input className={FIELD} type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </label>
      </div>
      <label className={LABEL}>
        Address (printed on invoices)
        <textarea className={`${FIELD} h-16 py-1`} value={address} onChange={(e) => setAddress(e.target.value)} maxLength={400} />
      </label>
      <div className="grid grid-cols-3 gap-3">
        <label className={LABEL}>
          Tax id (optional)
          <input className={FIELD} value={taxId} onChange={(e) => setTaxId(e.target.value)} maxLength={40} />
        </label>
        <label className={LABEL}>
          Invoice prefix
          <input className={FIELD} value={prefix} onChange={(e) => setPrefix(e.target.value)} maxLength={8} />
        </label>
        <label className={LABEL}>
          Payment terms (days)
          <input className={FIELD} inputMode="numeric" value={terms} onChange={(e) => setTerms(e.target.value)} />
        </label>
      </div>
      {message !== null ? (
        <p role="alert" className="text-xs text-red-500">
          {message}
        </p>
      ) : null}
      <div>
        <button type="submit" disabled={save.isPending} className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60">
          {company === null ? 'Create company' : 'Save'}
        </button>
        {save.isSuccess ? <span className="ml-3 text-xs text-muted-foreground">Saved.</span> : null}
      </div>
    </form>
  );
}
