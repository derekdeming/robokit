import { test, expect } from '@playwright/test';

test('root redirects unauthenticated users to /welcome', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBeLessThan(400);
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByText('Welcome to RoboKit')).toBeVisible();
});

test('protected routes redirect to /welcome when unauthenticated', async ({ page }) => {
  const protectedPaths = ['/dashboard', '/datasets', '/visualization'];
  for (const path of protectedPaths) {
    const resp = await page.goto(path);
    expect(resp?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/welcome$/);
  }
});


