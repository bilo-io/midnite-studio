import type { ApiCollectionSummary } from '@midnite/studio-shared';
import { toDraft } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { useApiClientStore, type ApiTab } from '../../store/api-client-store';
import { DEFAULT_LAYOUT, useUiStore } from '../../store/ui-store';
import { RequestBuilder } from './request-builder';

// Same stand-in `response-viewer.test.tsx`/`api-client-view.test.tsx` use —
// this suite is about the builder's own state, not Monaco's rendering, and a
// `<textarea>` driven by the same `value`/`onChange` props lets a test type
// into it like any other controlled field.
vi.mock('./monaco-field', () => ({
  MonacoField: ({
    value,
    onChange,
    language,
  }: {
    value: string;
    onChange: (v: string) => void;
    language: string;
  }) => (
    <textarea
      data-testid="monaco-field"
      data-language={language}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

/** No jest-dom in this repo's vitest setup — plain DOM property reads, same
 *  idiom `loop-composer.test.tsx`/`confirm-dialog.test.tsx` use. */
function valueOf(element: HTMLElement): string {
  return (element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
}
function checkedOf(element: HTMLElement): boolean {
  return (element as HTMLInputElement).checked;
}

const TAB_ID = 'tab-1';
const COLLECTION_ID = 'col-1';
const REPO_ID = 'repo-1';

function collectionWith(variables: { key: string; value?: string }[] = []): ApiCollectionSummary {
  return {
    id: COLLECTION_ID,
    fileName: 'demo.postman_collection.json',
    collection: { info: { name: 'Demo' }, item: [], variable: variables },
  };
}

function makeTab(overrides: Partial<ApiTab['draft']> = {}): ApiTab {
  const draft = {
    ...toDraft({ name: 'req', request: { method: 'GET', url: 'https://api.test/users' } }),
    ...overrides,
  };
  return {
    id: TAB_ID,
    repoId: REPO_ID,
    collectionId: COLLECTION_ID,
    itemPath: ['req'],
    draft,
    savedDraft: structuredClone(draft),
  };
}

function setup(tab: ApiTab, collections: ApiCollectionSummary[] = [collectionWith()]) {
  useUiStore.setState({ layout: DEFAULT_LAYOUT });
  useApiClientStore.setState({
    collections,
    collectionsRepoId: REPO_ID,
    collectionsStatus: 'ready',
    collectionsError: null,
    dirtyCollectionIds: new Set(),
    tabs: [tab],
    activeTabId: tab.id,
    responses: {},
    inFlight: {},
    lastError: {},
  });
  return render(
    <DialogHost>
      <RequestBuilder tabId={tab.id} />
    </DialogHost>,
  );
}

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

describe('RequestBuilder — body mode switching preserves content', () => {
  it('keeps json text when switching to raw and back', () => {
    setup(makeTab({ bodyMode: 'json' }));
    fireEvent.click(screen.getByRole('button', { name: 'Body' }));

    const field = screen.getByTestId('monaco-field');
    fireEvent.change(field, { target: { value: '{"a":1}' } });
    expect(valueOf(field)).toBe('{"a":1}');

    fireEvent.change(screen.getByLabelText('Body mode'), { target: { value: 'raw' } });
    expect(valueOf(screen.getByTestId('monaco-field'))).toBe('');

    fireEvent.change(screen.getByLabelText('Body mode'), { target: { value: 'json' } });
    expect(valueOf(screen.getByTestId('monaco-field'))).toBe('{"a":1}');
  });

  it('renders the "no body" line for none, and the language for xml/graphql', () => {
    setup(makeTab({ bodyMode: 'json' }));
    fireEvent.click(screen.getByRole('button', { name: 'Body' }));

    fireEvent.change(screen.getByLabelText('Body mode'), { target: { value: 'none' } });
    expect(screen.getByText('This request does not send a body.')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Body mode'), { target: { value: 'xml' } });
    expect(screen.getByTestId('monaco-field').dataset.language).toBe('xml');

    fireEvent.change(screen.getByLabelText('Body mode'), { target: { value: 'graphql' } });
    expect(screen.getByTestId('monaco-field').dataset.language).toBe('graphql');
  });

  it('renders a KeyValueTable for urlencoded, preserving rows through a mode round-trip', () => {
    setup(makeTab({ bodyMode: 'json' }));
    fireEvent.click(screen.getByRole('button', { name: 'Body' }));

    fireEvent.change(screen.getByLabelText('Body mode'), { target: { value: 'urlencoded' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
    fireEvent.change(screen.getByLabelText('Key 1'), { target: { value: 'grant_type' } });
    fireEvent.change(screen.getByLabelText('Value 1'), { target: { value: 'password' } });

    fireEvent.change(screen.getByLabelText('Body mode'), { target: { value: 'json' } });
    fireEvent.change(screen.getByLabelText('Body mode'), { target: { value: 'urlencoded' } });

    expect(valueOf(screen.getByLabelText('Key 1'))).toBe('grant_type');
    expect(valueOf(screen.getByLabelText('Value 1'))).toBe('password');
  });
});

describe('RequestBuilder — URL ↔ params sync', () => {
  it('renders params already on the draft (api-client-store.test.ts covers openTab seeding them from the URL)', () => {
    setup(makeTab({ params: [{ key: 'page', value: '2', enabled: true }] }));
    fireEvent.click(screen.getByRole('button', { name: 'Params' }));
    expect(valueOf(screen.getByLabelText('Key 1'))).toBe('page');
    expect(valueOf(screen.getByLabelText('Value 1'))).toBe('2');
  });

  it('table edit direction: editing a param row rewrites the URL, dropping a disabled row', () => {
    setup(makeTab({ url: 'https://api.test/users' }));
    fireEvent.click(screen.getByRole('button', { name: 'Params' }));

    fireEvent.click(screen.getByRole('button', { name: 'Add param' }));
    fireEvent.change(screen.getByLabelText('Key 1'), { target: { value: 'q' } });
    fireEvent.change(screen.getByLabelText('Value 1'), { target: { value: 'hello' } });
    expect(valueOf(screen.getByLabelText('URL'))).toBe('https://api.test/users?q=hello');

    fireEvent.click(screen.getByRole('button', { name: 'Add param' }));
    fireEvent.change(screen.getByLabelText('Key 2'), { target: { value: 'debug' } });
    fireEvent.change(screen.getByLabelText('Value 2'), { target: { value: '1' } });
    fireEvent.click(screen.getByLabelText('Enabled row 2'));
    expect(checkedOf(screen.getByLabelText('Enabled row 2'))).toBe(false);

    // Disabled row is left out of the URL but the row itself survives in the table.
    expect(valueOf(screen.getByLabelText('URL'))).toBe('https://api.test/users?q=hello');
    expect(valueOf(screen.getByLabelText('Key 2'))).toBe('debug');
  });

  it('URL-authoritative direction: typing a new URL and blurring re-parses the Params tab', () => {
    setup(makeTab({ url: 'https://api.test/users' }));
    fireEvent.click(screen.getByRole('button', { name: 'Params' }));

    const url = screen.getByLabelText('URL');
    fireEvent.change(url, { target: { value: 'https://api.test/users?sort=desc' } });
    // Not yet reflected in the table — only a blur commits the URL's own
    // query string into `draft.params` (the sync rule's "on blur" half).
    expect(screen.queryByLabelText('Key 1')).toBeNull();

    fireEvent.blur(url);
    expect(valueOf(screen.getByLabelText('Key 1'))).toBe('sort');
    expect(valueOf(screen.getByLabelText('Value 1'))).toBe('desc');
  });
});

describe('RequestBuilder — Auth tab contributions', () => {
  it('bearer token shows up as a computed Authorization header, not a user row', () => {
    setup(makeTab({ auth: { type: 'bearer', token: 'abc123' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Headers' }));
    expect(valueOf(screen.getByLabelText('Auto-generated Authorization value'))).toBe('Bearer abc123');
    expect(screen.queryByLabelText('Key 1')).toBeNull();
  });

  it('apikey in query shows up in the computed Params preview, never in the user rows', () => {
    setup(makeTab({ auth: { type: 'apikey', key: 'api_key', value: 'secret', in: 'query' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Params' }));
    expect(valueOf(screen.getByLabelText('Auto-generated api_key value'))).toBe('secret');
    expect(screen.queryByLabelText('Key 1')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Headers' }));
    expect(screen.queryByText('api_key')).toBeNull();
  });

  it('apikey in header shows up in the computed Headers preview, not Params', () => {
    setup(makeTab({ auth: { type: 'apikey', key: 'X-Api-Key', value: 'secret', in: 'header' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Headers' }));
    expect(valueOf(screen.getByLabelText('Auto-generated X-Api-Key value'))).toBe('secret');

    fireEvent.click(screen.getByRole('button', { name: 'Params' }));
    expect(screen.queryByLabelText(/Auto-generated/)).toBeNull();
  });

  it('switching auth type from the dropdown updates the fields shown', () => {
    setup(makeTab({ auth: { type: 'none' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Auth' }));
    expect(screen.queryByLabelText('Token')).toBeNull();

    fireEvent.change(screen.getByLabelText('Auth type'), { target: { value: 'bearer' } });
    expect(screen.getByLabelText('Token')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Auth type'), { target: { value: 'basic' } });
    expect(screen.getByLabelText('Username')).toBeDefined();
    expect(screen.getByLabelText('Password')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Auth type'), { target: { value: 'apikey' } });
    expect(screen.getByLabelText('Key')).toBeDefined();
    expect(screen.getByLabelText('Add to')).toBeDefined();
  });

  it('never masks a value — every Auth field is a plain text input', () => {
    setup(makeTab({ auth: { type: 'basic', username: 'alice', password: 'hunter2' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Auth' }));
    expect(screen.getByLabelText('Password').getAttribute('type')).toBe('text');
    expect(screen.getByText(/Values are saved to the collection file/)).toBeDefined();
  });
});
