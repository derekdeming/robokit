import { test, expect } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { loginWithClerk } from './utils/auth';

test.describe('datasets page', () => {
  test('renders empty state or list after login', async ({ page }) => {
    await setupClerkTestingToken({ page });
    await loginWithClerk(page);

    await page.goto('/datasets');
    await expect(page.getByRole('heading', { name: 'Datasets' })).toBeVisible();
    
    // Check if we have an empty state or datasets
    const empty = page.getByText('No datasets uploaded yet');
    const datasetCards = page.getByTestId('dataset-card');
    
    // Either we should see the empty state message, or at least one dataset card
    const hasEmpty = await empty.isVisible();
    const hasCards = await datasetCards.first().isVisible();
    
    expect(hasEmpty || hasCards).toBe(true);
  });
});


