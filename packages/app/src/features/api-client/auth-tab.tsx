import type { ApiAuth } from '@midnite/studio-shared';

import { useApiClientStore } from '../../store/api-client-store';

type AuthType = ApiAuth['type'];

const AUTH_TYPES: { value: AuthType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'apikey', label: 'API Key' },
];

const FIELD_CLASS = 'h-7 rounded-md border border-border bg-background px-2 font-mono text-xs';
const LABEL_CLASS = 'text-[11px] font-medium text-muted-foreground';

/**
 * The Auth tab (Phase 66 Theme D) — `None` / `Bearer Token` / `Basic Auth` /
 * `API Key`, each with its own field set. Switching type replaces
 * `draft.auth` with a fresh union member, carrying over a same-named field
 * from the outgoing one (`token`, `username`/`password`) where the shape
 * has one, so a round trip through the dropdown does not lose what was typed.
 *
 * Decision 10: **nothing here is masked, and nothing is stored specially.**
 * Every field is a plain `type="text"` input — a password field would visibly
 * imply a protection this phase does not have — and the hint at the bottom
 * says so in the app's own words, pointing at the Phase 70 overlay that
 * turns masking on for real.
 */
export function AuthTab({ tabId }: { tabId: string }) {
  const tab = useApiClientStore((s) => s.tabs.find((t) => t.id === tabId));
  const editDraft = useApiClientStore((s) => s.editDraft);
  if (!tab) return null;

  const auth = tab.draft.auth;

  const setType = (type: AuthType) => {
    switch (type) {
      case 'none':
        editDraft(tabId, { auth: { type: 'none' } });
        return;
      case 'bearer':
        editDraft(tabId, { auth: { type: 'bearer', token: auth.type === 'bearer' ? auth.token : '' } });
        return;
      case 'basic':
        editDraft(tabId, {
          auth: {
            type: 'basic',
            username: auth.type === 'basic' ? auth.username : '',
            password: auth.type === 'basic' ? auth.password : '',
          },
        });
        return;
      case 'apikey':
        editDraft(tabId, {
          auth: {
            type: 'apikey',
            key: auth.type === 'apikey' ? auth.key : '',
            value: auth.type === 'apikey' ? auth.value : '',
            in: auth.type === 'apikey' ? auth.in : 'header',
          },
        });
        return;
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
      <label className="flex flex-col gap-1">
        <span className={LABEL_CLASS}>Type</span>
        <select
          aria-label="Auth type"
          value={auth.type}
          onChange={(event) => setType(event.target.value as AuthType)}
          className={`${FIELD_CLASS} w-48`}
        >
          {AUTH_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {auth.type === 'bearer' ? (
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Token</span>
          <input
            aria-label="Token"
            value={auth.token}
            onChange={(event) => editDraft(tabId, { auth: { type: 'bearer', token: event.target.value } })}
            placeholder="{{token}}"
            className={`${FIELD_CLASS} w-full`}
          />
        </label>
      ) : null}

      {auth.type === 'basic' ? (
        <>
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLASS}>Username</span>
            <input
              aria-label="Username"
              value={auth.username}
              onChange={(event) =>
                editDraft(tabId, { auth: { type: 'basic', username: event.target.value, password: auth.password } })
              }
              className={`${FIELD_CLASS} w-full`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLASS}>Password</span>
            <input
              aria-label="Password"
              type="text"
              value={auth.password}
              onChange={(event) =>
                editDraft(tabId, { auth: { type: 'basic', username: auth.username, password: event.target.value } })
              }
              className={`${FIELD_CLASS} w-full`}
            />
          </label>
        </>
      ) : null}

      {auth.type === 'apikey' ? (
        <>
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLASS}>Key</span>
            <input
              aria-label="Key"
              value={auth.key}
              onChange={(event) =>
                editDraft(tabId, { auth: { type: 'apikey', key: event.target.value, value: auth.value, in: auth.in } })
              }
              className={`${FIELD_CLASS} w-full`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLASS}>Value</span>
            <input
              aria-label="Value"
              value={auth.value}
              onChange={(event) =>
                editDraft(tabId, { auth: { type: 'apikey', key: auth.key, value: event.target.value, in: auth.in } })
              }
              className={`${FIELD_CLASS} w-full`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLASS}>Add to</span>
            <select
              aria-label="Add to"
              value={auth.in}
              onChange={(event) =>
                editDraft(tabId, {
                  auth: { type: 'apikey', key: auth.key, value: auth.value, in: event.target.value as 'header' | 'query' },
                })
              }
              className={`${FIELD_CLASS} w-48`}
            >
              <option value="header">Header</option>
              <option value="query">Query params</option>
            </select>
          </label>
        </>
      ) : null}

      <p className="mt-2 max-w-md text-[11px] text-muted-foreground">
        Values are saved to the collection file. Use an environment variable for secrets (coming
        in a later release).
      </p>
    </div>
  );
}
