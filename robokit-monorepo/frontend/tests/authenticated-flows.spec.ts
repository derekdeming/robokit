import { test, expect } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { getE2EUserCreds, loginWithClerk } from './utils/auth';

test.describe('authenticated flows', () => {
  test('sign in and see dashboard', async ({ page }) => {
    await setupClerkTestingToken({ page });

    const creds = getE2EUserCreds();

    await loginWithClerk(page, creds.email, creds.password);

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // navigate to see if the sign in is persisted
    await page.goto('/datasets');
    await expect(page.getByRole('heading', { name: 'Datasets' })).toBeVisible();

    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });
});


