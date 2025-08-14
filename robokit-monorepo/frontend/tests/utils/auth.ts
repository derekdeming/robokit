import { Page, expect } from '@playwright/test';
import { clerk, clerkSetup } from '@clerk/testing/playwright'


export function getE2EUserCreds(): { email: string; password: string } {
  const email = process.env.E2E_CLERK_EMAIL;
  const password = process.env.E2E_CLERK_PASSWORD;
  if (!email || !password) {
    throw new Error('Missing Clerk E2E creds');
  }
  return { email, password };
}

export async function loginWithClerk(page: Page, email?: string, password?: string): Promise<void> {
  await page.goto('/welcome');

  if (!email || !password) {
    const creds = getE2EUserCreds();
    email = creds.email;
    password = creds.password;
  }

  await clerk.signIn({
    page,
    signInParams: {
      strategy: 'password',
      identifier: email,
      password,
    }
  })

  await page.waitForURL(/\/dashboard$/, { timeout: 10000 }).catch(() => {});
}


