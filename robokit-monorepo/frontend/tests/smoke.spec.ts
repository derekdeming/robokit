import { test, expect } from '@playwright/test';

test('welcome page renders', async ({ page }) => {
  await page.goto('/welcome');
  await expect(page.getByText('Welcome to RoboKit')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign Up' })).toBeVisible();
});


