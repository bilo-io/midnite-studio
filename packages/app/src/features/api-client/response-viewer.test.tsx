import type { ApiResponse } from '@midnite/studio-shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useApiClientStore } from '../../store/api-client-store';
import { ResponseViewer } from './response-viewer';

// `monaco-field.tsx` wraps `@monaco-editor/react`, which needs a real DOM
// layout engine jsdom does not provide (`code-editor.test.tsx`'s own
// precedent). This suite is about which renderer `ResponseViewer` PICKS for
// a given content-type, not about Monaco's own rendering, so the field is
// replaced with a stand-in that surfaces its `language` and `value` props.
vi.mock('./monaco-field', () => ({
  MonacoField: ({ value, language, readOnly }: { value: string; language: string; readOnly?: boolean }) => (
    <div data-testid="monaco-field" data-language={language} data-readonly={String(Boolean(readOnly))}>
      {value}
    </div>
  ),
}));

const TAB_ID = 'tab-1';

function baseResponse(overrides: Partial<ApiResponse> = {}): ApiResponse {
  return {
    status: 200,
    statusText: 'OK',
    headers: { 'x-request-id': 'abc123' },
    body: '{}',
    bodyIsJson: false,
    contentType: 'application/json',
    durationMs: 42,
    sizeBytes: 128,
    truncated: false,
    warnings: [],
    ...overrides,
  };
}

describe('ResponseViewer', () => {
  beforeEach(() => {
    useApiClientStore.setState({
      tabs: [],
      activeTabId: null,
      responses: {},
      inFlight: {},
      lastError: {},
    });
  });

  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('shows the empty state before the first send', () => {
    render(<ResponseViewer tabId={TAB_ID} />);
    expect(screen.getByText('Send the request to see a response.')).toBeDefined();
  });

  it('shows a skeleton and Cancel while a send is in flight', () => {
    useApiClientStore.setState({ inFlight: { [TAB_ID]: 'req-1' } });
    render(<ResponseViewer tabId={TAB_ID} />);
    expect(screen.getByText('Sending request')).toBeDefined();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDefined();
  });

  describe('content-type branches', () => {
    it('picks the JSON renderer, pretty-printed, for application/json', () => {
      useApiClientStore.setState({
        responses: { [TAB_ID]: [baseResponse({ contentType: 'application/json', body: '{"a":1}' })] },
      });
      render(<ResponseViewer tabId={TAB_ID} />);
      const field = screen.getByTestId('monaco-field');
      expect(field.dataset.language).toBe('json');
      expect(field.textContent).toBe(JSON.stringify({ a: 1 }, null, 2));
    });

    it('falls to text with a "Not valid JSON" note when the content-type lies', () => {
      useApiClientStore.setState({
        responses: { [TAB_ID]: [baseResponse({ contentType: 'application/json', body: 'not json' })] },
      });
      render(<ResponseViewer tabId={TAB_ID} />);
      expect(screen.getByText('Not valid JSON')).toBeDefined();
      expect(screen.getByTestId('monaco-field').dataset.language).toBe('plaintext');
    });

    it('picks the JSON renderer via bodyIsJson even without a json content-type', () => {
      useApiClientStore.setState({
        responses: {
          [TAB_ID]: [baseResponse({ contentType: 'text/plain', bodyIsJson: true, body: '{"ok":true}' })],
        },
      });
      render(<ResponseViewer tabId={TAB_ID} />);
      expect(screen.getByTestId('monaco-field').dataset.language).toBe('json');
    });

    it('picks the XML renderer for an xml content-type', () => {
      useApiClientStore.setState({
        responses: { [TAB_ID]: [baseResponse({ contentType: 'application/xml', body: '<a/>' })] },
      });
      render(<ResponseViewer tabId={TAB_ID} />);
      expect(screen.getByTestId('monaco-field').dataset.language).toBe('xml');
    });

    it('picks the HTML renderer for text/html', () => {
      useApiClientStore.setState({
        responses: { [TAB_ID]: [baseResponse({ contentType: 'text/html', body: '<p>hi</p>' })] },
      });
      render(<ResponseViewer tabId={TAB_ID} />);
      expect(screen.getByTestId('monaco-field').dataset.language).toBe('html');
    });

    it('picks plaintext for an ordinary text content-type', () => {
      useApiClientStore.setState({
        responses: { [TAB_ID]: [baseResponse({ contentType: 'text/plain', body: 'hello' })] },
      });
      render(<ResponseViewer tabId={TAB_ID} />);
      expect(screen.getByTestId('monaco-field').dataset.language).toBe('plaintext');
    });

    it('renders an <img> for an image content-type under the inline cap', () => {
      useApiClientStore.setState({
        responses: {
          [TAB_ID]: [baseResponse({ contentType: 'image/png', body: 'ZmFrZQ==', sizeBytes: 1024 })],
        },
      });
      render(<ResponseViewer tabId={TAB_ID} />);
      const img = screen.getByAltText('Response body') as HTMLImageElement;
      expect(img.src.startsWith('data:image/png;base64,')).toBe(true);
    });

    it('shows the size placeholder instead of an <img> once over the inline cap', () => {
      useApiClientStore.setState({
        responses: {
          [TAB_ID]: [baseResponse({ contentType: 'image/png', body: 'x', sizeBytes: 3 * 1024 * 1024 })],
        },
      });
      render(<ResponseViewer tabId={TAB_ID} />);
      expect(screen.queryByAltText('Response body')).toBeNull();
      expect(screen.getByText(/no preview/)).toBeDefined();
    });

    it('shows the "no preview" card and a disabled Save button for an opaque content-type', () => {
      useApiClientStore.setState({
        responses: {
          [TAB_ID]: [baseResponse({ contentType: 'application/octet-stream', body: 'x', sizeBytes: 5 })],
        },
      });
      render(<ResponseViewer tabId={TAB_ID} />);
      expect(screen.getByText(/application\/octet-stream/)).toBeDefined();
      expect(screen.getByText(/no preview/)).toBeDefined();
      const save = screen.getByRole('button', { name: 'Save response as…' }) as HTMLButtonElement;
      expect(save.disabled).toBe(true);
    });
  });

  describe('truncated banner', () => {
    it('appears when truncated is set', () => {
      useApiClientStore.setState({
        responses: { [TAB_ID]: [baseResponse({ truncated: true })] },
      });
      render(<ResponseViewer tabId={TAB_ID} />);
      expect(screen.getByText(/Response truncated at/)).toBeDefined();
    });

    it('does not appear when truncated is false', () => {
      useApiClientStore.setState({
        responses: { [TAB_ID]: [baseResponse({ truncated: false })] },
      });
      render(<ResponseViewer tabId={TAB_ID} />);
      expect(screen.queryByText(/Response truncated at/)).toBeNull();
    });
  });

  describe('failure envelope', () => {
    it('renders the message and a Retry button, never throwing', () => {
      useApiClientStore.setState({ lastError: { [TAB_ID]: 'Request timed out after 30000ms' } });
      expect(() => render(<ResponseViewer tabId={TAB_ID} />)).not.toThrow();
      expect(screen.getByText('Request timed out after 30000ms')).toBeDefined();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeDefined();
    });

    it('Retry does not throw with no bridge installed', async () => {
      useApiClientStore.setState({ lastError: { [TAB_ID]: 'Request timed out' } });
      render(<ResponseViewer tabId={TAB_ID} />);
      const retry = screen.getByRole('button', { name: 'Retry' });
      expect(() => retry.click()).not.toThrow();
    });
  });
});
