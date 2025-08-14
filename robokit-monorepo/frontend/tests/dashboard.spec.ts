import { test, expect } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { getE2EUserCreds, loginWithClerk } from './utils/auth';

test.describe('dashboard smoke', () => {
  test('shows counters and 3D viewer after login', async ({ page }) => {
    await setupClerkTestingToken({ page });

    await loginWithClerk(page);

    await page.goto('/dashboard');
    await expect(page.getByText('Total Datasets')).toBeVisible();
    await expect(page.getByText('3D Visualization')).toBeVisible();
  });
});


