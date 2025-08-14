import { test, expect } from '@playwright/test';
import { loginWithClerk } from './utils/auth';

const REAL_DATASET_ID = 'observabot/so101_die_mat1';
const REAL_REVISION = '798bdb77ec854d6f5347c3b7fd893a2ccad9f7d3';

test.describe('real backend dataset connect/delete (no mocks) @real', () => {
  test.describe.configure({ mode: 'serial' });

  test('connect HF dataset by ID + revision and see in list', async ({ page }) => {
    // Pre-check: require real API URL and health
    const apiUrl = process.env.API_URL;
    if (!apiUrl) test.skip(true, 'API_URL not set');
    const health = await page.request.get(`${apiUrl}/health`).catch(() => null);
    if (!health || !health.ok()) test.skip(true, 'Backend API not reachable');

    await loginWithClerk(page);

    // Go to upload wizard
    await page.goto('/upload');
    await expect(page.getByText('Choose Data Source', { exact: true })).toBeVisible();

    // Select Hugging Face flow
    const useHf = page.getByRole('button', { name: 'Use Hugging Face Datasets' });
    if (await useHf.isVisible().catch(() => false)) {
      await useHf.click();
    } else {
      await page.getByText('Hugging Face Datasets').first().click();
    }

    // Go to Direct tab
    await page.getByRole('tab', { name: 'Connect by ID' }).click();

    // Fill dataset id and revision
    await page.getByLabel('Dataset ID').fill(REAL_DATASET_ID);
    await page.getByLabel('Revision (optional)').fill(REAL_REVISION);

    // Connect
    const connectBtn = page.getByRole('button', { name: 'Connect Dataset' });
    await expect(connectBtn).toBeEnabled();
    await connectBtn.click();

    // After success, wizard shows completion; proceed to datasets
    await page.getByRole('button', { name: 'View Datasets' }).click();

    // Verify card with repo id appears
    await expect(page.getByText(REAL_DATASET_ID)).toBeVisible({ timeout: 60000 });
  });

  test('open dataset details and see sections', async ({ page }) => {
    const apiUrl = process.env.API_URL;
    if (!apiUrl) test.skip(true, 'API_URL not set');
    const health = await page.request.get(`${apiUrl}/health`).catch(() => null);
    if (!health || !health.ok()) test.skip(true, 'Backend API not reachable');

    await loginWithClerk(page);

    await page.goto('/datasets');
    await expect(page.getByRole('heading', { name: 'Datasets' })).toBeVisible();

    // Find the real dataset card and go to details
    const card = page.locator('[data-testid="dataset-card"]', { hasText: REAL_DATASET_ID }).first();
    await expect(card).toBeVisible({ timeout: 60000 });
    await card.getByRole('button', { name: 'View' }).click();

    // Details sections
    await expect(page.getByRole('heading', { name: /Dataset #/ })).toBeVisible();
    await expect(page.getByText('Summary', { exact: true })).toBeVisible();
    await expect(page.getByText('Jobs', { exact: true })).toBeVisible();
  });

  test('delete HF dataset from list', async ({ page }) => {
    const apiUrl = process.env.API_URL;
    if (!apiUrl) test.skip(true, 'API_URL not set');
    const health = await page.request.get(`${apiUrl}/health`).catch(() => null);
    if (!health || !health.ok()) test.skip(true, 'Backend API not reachable');

    await loginWithClerk(page);

    await page.goto('/datasets');
    await expect(page.getByRole('heading', { name: 'Datasets' })).toBeVisible();

    // Find the card with the real dataset id
    const card = page.locator('[data-testid="dataset-card"]', { hasText: REAL_DATASET_ID }).first();
    await expect(card).toBeVisible({ timeout: 60000 });

    // Confirm deletion dialog
    page.once('dialog', (d) => d.accept());
    await card.getByRole('button', { name: 'Delete' }).click();

    // Ensure it disappears
    await expect(page.getByText(REAL_DATASET_ID)).toBeHidden({ timeout: 60000 });
  });
});


