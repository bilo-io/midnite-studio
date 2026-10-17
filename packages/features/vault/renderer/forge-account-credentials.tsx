import { Field, TextField, useFrameChrome } from '@midnite/studio-frame';
import type { ForgeAccount } from '@midnite/studio-shared';
import { useState, type CSSProperties, type FormEvent, type Ref } from 'react';
import { LuTrash2 } from 'react-icons/lu';

import { useVaultForgeKit, type VaultForgeProvider } from './host';

/**
 * The credential half of Studio's Settings ▸ Accounts (Phase 113 Theme J slice 3), moved here from
 * `packages/app/.../accounts-page.tsx` unchanged in look and behaviour. Studio's page keeps what is
 * forge's — the account list's "Make active", switching preferences, reachable repos, the setup
 * banner — and renders these three through composition, with its forge kit lent by the
 * {@link useVaultForgeKit} host port.
 *
 * **A token only ever goes in.** The add form sends it one way through the kit's add mutation (the
 * existing `forgeAccountAdd` channel, which validates it against the provider before storing it) and
 * is told back an account's metadata or an error sentence — never a stored token. The field is the
 * frame's `TextField`, as it always was on this page; nothing reads a token back to fill it.
 */

/**
 * The "Add an account" form: the provider picker, the personal-access-token field with the provider's
 * exact scopes spelled out, the provider's error, and submit. `formRef` lets the page focus it when the
 * account switcher's "Add account…" asked (that request is the page's, not the vault's).
 */
export function ForgeAccountAddForm({ formRef }: { formRef?: Ref<HTMLFormElement> }) {
  const { providers, useAddAccount } = useVaultForgeKit();
  const addAccount = useAddAccount();
  const [kind, setKind] = useState<VaultForgeProvider['kind']>(providers[0]?.kind ?? 'github');
  const [token, setToken] = useState('');
  const provider = providers.find((p) => p.kind === kind) ?? providers[0];
  if (!provider) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    addAccount.mutate(
      { kind, host: provider.host, token: token.trim() || undefined },
      { onSuccess: (result) => result.ok && setToken('') },
    );
  };

  return (
    <form ref={formRef} aria-label="Add an account" className="flex flex-col gap-3 p-3" onSubmit={submit}>
      <ForgeProviderPicker providers={providers} value={kind} onChange={setKind} />
      <Field label="Personal access token" hint={provider.tokenHint}>
        <TextField
          value={token}
          onChange={setToken}
          label="Personal access token"
          placeholder={kind === 'github' ? '(optional)' : 'paste a token'}
          className="font-mono"
        />
      </Field>
      {addAccount.data && !addAccount.data.ok ? (
        <p role="alert" className="text-[11px] text-red-500">
          {addAccount.data.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={addAccount.isPending || (kind !== 'github' && token.trim().length === 0)}
        className="h-7 w-fit rounded-md border border-border px-3 text-xs font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {addAccount.isPending ? 'Verifying…' : `Add ${provider.label} account`}
      </button>
    </form>
  );
}

/**
 * The "Provider" field on the add-account form — a `Choice`-style segmented
 * control, not `Choice` itself: `Choice` is generic over plain `[value,
 * label]` string tuples shared with every other settings page, and has no
 * room for a per-option icon or colour without teaching that shared control
 * about brand colours it has no other consumer for. So this stays a small
 * one-off over the kit's provider rows, matching `Choice`'s own layout
 * (`Field` wrapper, `role="radiogroup"`) so it reads as the same control with
 * icons, not a different one.
 */
function ForgeProviderPicker({
  providers,
  value,
  onChange,
}: {
  providers: readonly VaultForgeProvider[];
  value: VaultForgeProvider['kind'];
  onChange: (next: VaultForgeProvider['kind']) => void;
}) {
  return (
    <Field label="Provider" hint="Which forge this identity belongs to.">
      <div role="radiogroup" aria-label="Provider" className="flex flex-wrap gap-1">
        {providers.map(({ kind, label, Icon, brand }) => {
          const selected = value === kind;
          return (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(kind)}
              /*
                `--brand-light`/`--brand-dark` are the only theme-aware bit —
                the composing app's `.forge-provider-option` rule (Studio's
                styles.css) picks the right one into `--forge-brand` per `.dark`,
                so the `color-mix()` below never has to know which theme is
                active. Selected-only border and wash; the icon carries its brand
                colour regardless of selection.
              */
              style={
                {
                  '--brand-light': brand.light,
                  '--brand-dark': brand.dark,
                  ...(selected
                    ? {
                        borderColor: 'color-mix(in srgb, var(--forge-brand) 55%, transparent)',
                        background: 'color-mix(in srgb, var(--forge-brand) 14%, transparent)',
                      }
                    : {}),
                } as CSSProperties
              }
              className={`forge-provider-option flex h-6 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors ${
                selected ? 'text-foreground' : 'border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--forge-brand)' }} />
              {label}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

/**
 * An account row's trash button: deletes the stored token (and the account record) through the kit —
 * after the same destructive confirm the Vault view's own Remove shows. A delegated GitHub account
 * holds no token, so its confirm says only the record is forgotten.
 */
export function ForgeAccountRemoveButton({ account }: { account: ForgeAccount }) {
  const removeAccount = useVaultForgeKit().useRemoveAccount();
  const dialogs = useFrameChrome().useDialogs();
  const name = account.displayName || account.login;
  const confirmRemove = () =>
    dialogs.confirm({
      title: `Remove ${name} on ${account.host}?`,
      body: account.hasToken
        ? 'The stored token is deleted and the account is forgotten here. The account stays on the provider.'
        : 'The account is forgotten here. gh keeps its own login.',
      confirmLabel: 'Remove',
      danger: true,
      blastRadiusKind: 'credentials',
      blastRadius: { count: account.hasToken ? 1 : 0, sample: [] },
      onConfirm: () => removeAccount.mutate(account.id),
    });
  return (
    <button
      type="button"
      onClick={confirmRemove}
      aria-label={`Remove ${account.displayName || account.login}`}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <LuTrash2 className="h-3.5 w-3.5" />
    </button>
  );
}

/** "How this works": what is stored, where, and that the page is only ever told a token exists. */
export function ForgeCredentialsNote() {
  return (
    <div className="flex flex-col gap-2 p-3 text-[11px] leading-relaxed text-muted-foreground">
      <p>
        Adding an account validates the token first — a token this app cannot verify is never stored. GitHub
        accounts hold no token at all: <code>gh</code> remains the credential, exactly as every other GitHub read
        in this app already works.
      </p>
      <p>
        Every other token is encrypted with your OS keychain before it ever touches disk, and this page is only
        ever told whether a token exists — never what it is.
      </p>
    </div>
  );
}
