import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Phase 70 Theme A — the environment editor's own masked row and the
 * blast-radius confirm before the first secret this app writes for a repo,
 * plus the switcher reflecting a newly-created environment as the active one.
 *
 * The filesystem half of Theme A — "the committed base file never contains a
 * secret value" — is proven by `environment-io.test.ts`'s own raw-bytes
 * assertion (`save with two secret rows writes neither value into the base
 * file`), not here: a mocked bridge has no real file to read, so a Playwright
 * spec asserting "the file on disk" would either fake the read or assert
 * nothing real. What a spec over a mocked bridge CAN prove — and what these
 * two tests do prove — is the UI's own reaction: a secret-typed row masks its
 * value, the confirm gate blocks an unprotected save, and accepting it hands
 * the new environment straight to the switcher.
 *
 * **A real bug this suite found, not a fixture workaround**: opening the
 * switcher's popover with a plain `.click()` closes it again within the same
 * tick. `Popover` (`components/popover.tsx`) registers a capture-phase
 * `scroll` listener the moment it opens and dismisses on any scroll outside
 * its own panel — and a *mouse* click on this specific trigger reliably
 * fires one benign scroll elsewhere on the page (traced with a throwaway
 * `console.error` in `onScroll`, then reverted — the scrolled node was a
 * `@bilo-io/shell` nav-rail container, not anything Phase 70 touches), which
 * the listener reads as "the user scrolled away" and closes the panel it
 * only just opened. `Popover`'s own `useFocusTrap` call passes
 * `preventScroll: true`, so it is not the trap itself scrolling — something
 * about mouse-driven focus on this trigger, in this view, trips a reaction
 * in the third-party shell rail. **Keyboard activation (`focus()` +
 * `Enter`) does not trigger it** — confirmed directly, and used as this
 * suite's open action below — which makes this a real, narrow interaction
 * bug in shared infrastructure (`Popover` × `@bilo-io/shell`), not a defect
 * in Theme A's own code, and out of scope to patch from a verification
 * theme. Filed here rather than silently routed around: a plain mouse click
 * on "Select environment" is currently unreliable.
 */
async function openEnvironmentSwitcher(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Select environment' }).focus();
  await page.keyboard.press('Enter');
}

const collection = {
  info: { name: 'Gateway', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  item: [{ name: 'Health check', request: { method: 'GET', url: { raw: '{{baseUrl}}/health' } } }],
};

const withCollection: MockFixtures = {
  ...fixtures,
  apiCollections: [{ id: 'gateway.postman_collection.json', fileName: 'gateway.postman_collection.json', collection }],
};

test('a secret row masks its value, and saving an unprotected repo needs the blast-radius confirm', async ({ page }) => {
  await installMockBridge(page, withCollection);
  await page.goto('/');
  await clickRailLink(page, 'API Client');

  await openEnvironmentSwitcher(page);
  await page.getByText('New environment…').click();

  const dialog = page.getByRole('dialog', { name: 'New environment' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Environment name').fill('Local');

  // One plain row, one secret row — the phase doc's own wording.
  await dialog.getByText('Add variable').click();
  await dialog.getByText('Add variable').click();

  const rows = dialog.locator('tbody tr');
  await rows.nth(0).getByLabel('Key').fill('baseUrl');
  await rows.nth(0).getByLabel('Value').fill('http://127.0.0.1:7777');

  await rows.nth(1).getByLabel('Key').fill('apiKey');
  await rows.nth(1).getByLabel('Value').fill('sk-super-secret');
  // Toggles the row's type from Default to Secret.
  await rows.nth(1).getByRole('button', { name: 'Default' }).click();

  const secretValue = rows.nth(1).getByLabel('Value');
  await expect(secretValue).toHaveAttribute('type', 'password');

  // Hold-to-reveal: the value is plain text only while the button is held.
  const reveal = rows.nth(1).getByRole('button', { name: 'Hold to reveal' });
  await reveal.dispatchEvent('mousedown');
  await expect(secretValue).toHaveAttribute('type', 'text');
  await reveal.dispatchEvent('mouseup');
  await expect(secretValue).toHaveAttribute('type', 'password');

  // The plain row never masks.
  await expect(rows.nth(0).getByLabel('Value')).toHaveAttribute('type', 'text');

  await dialog.getByRole('button', { name: 'Save' }).click();

  // One secret row in a repo nothing has protected yet — the confirm fires
  // before anything is written (`environment-io.ts`'s own once-per-repo gate,
  // mirrored by the mock's `apiEnvGitignoreProtected` default of `false`).
  const confirm = page.getByRole('dialog', { name: 'Write secret values to this repository?' });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText('1 secret value will be written to a local, gitignored overlay file, never committed.')).toBeVisible();

  await confirm.getByRole('button', { name: 'Write secrets' }).click();
  await expect(confirm).toBeHidden();
  await expect(dialog).toBeHidden();

  // A brand-new environment becomes the repo's active one immediately.
  await expect(page.getByRole('button', { name: 'Select environment' })).toContainText('Local');
});

test('an environment with no secret rows never needs the confirm, and switching it updates the switcher', async ({ page }) => {
  await installMockBridge(page, {
    ...withCollection,
    apiEnvironments: [
      {
        id: 'prod.postman_environment.json',
        fileName: 'prod.postman_environment.json',
        environment: { id: 'env-prod', name: 'Prod', values: [{ key: 'baseUrl', value: 'https://api.prod.example.com', type: 'default', enabled: true }] },
      },
    ],
  });
  await page.goto('/');
  await clickRailLink(page, 'API Client');

  const switcher = page.getByRole('button', { name: 'Select environment' });
  await expect(switcher).toContainText('No environment');

  await openEnvironmentSwitcher(page);
  await page.getByText('Prod', { exact: true }).click();
  await expect(switcher).toContainText('Prod');

  // Editing it back to empty and saving needs no confirm at all.
  await openEnvironmentSwitcher(page);
  await page.getByLabel('Edit Prod').click();
  const dialog = page.getByRole('dialog', { name: 'Edit environment "Prod"' });
  await dialog.getByRole('button', { name: 'Remove row' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Write secret values to this repository?' })).toBeHidden();
});

/**
 * Phase 70 Theme E's leftover verification item: "switching environments
 * changes a request's resolved-URL preview without reopening the tab."
 * `request-builder.tsx` derives the preview on every render from
 * `environments`/`collection` state (`computed-fields.ts`'s `resolveUrlPreview`),
 * so switching the active environment through the same tab re-renders it —
 * no close/reopen, no new IPC call.
 */
test("switching environments changes the URL preview without reopening the tab", async ({
  page,
}) => {
  await installMockBridge(page, {
    ...withCollection,
    apiEnvironments: [
      {
        id: 'dev.postman_environment.json',
        fileName: 'dev.postman_environment.json',
        environment: {
          id: 'env-dev',
          name: 'Dev',
          values: [{ key: 'baseUrl', value: 'https://dev.example.com', type: 'default', enabled: true }],
        },
      },
      {
        id: 'prod.postman_environment.json',
        fileName: 'prod.postman_environment.json',
        environment: {
          id: 'env-prod',
          name: 'Prod',
          values: [
            { key: 'baseUrl', value: 'https://api.prod.example.com', type: 'default', enabled: true },
          ],
        },
      },
    ],
  });
  await page.goto('/');
  await clickRailLink(page, 'API Client');
  await page.getByText('Health check', { exact: true }).click();

  const preview = page.getByTestId('url-preview');
  const urlInput = page.getByLabel('URL', { exact: true });
  await expect(urlInput).toHaveValue('{{baseUrl}}/health');

  // No environment selected: `{{baseUrl}}` resolves against nothing (the
  // collection carries no `variable[]` of its own), so there is nothing to
  // preview and the line stays hidden.
  await expect(preview).toBeHidden();

  await openEnvironmentSwitcher(page);
  await page.getByText('Dev', { exact: true }).click();
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('https://dev.example.com/health');
  // The raw draft is untouched — the preview is a read-only derived line.
  await expect(urlInput).toHaveValue('{{baseUrl}}/health');

  // Same tab, same request — switching again just re-renders the preview.
  await openEnvironmentSwitcher(page);
  await page.getByText('Prod', { exact: true }).click();
  await expect(preview).toContainText('https://api.prod.example.com/health');
  await expect(urlInput).toHaveValue('{{baseUrl}}/health');
});
