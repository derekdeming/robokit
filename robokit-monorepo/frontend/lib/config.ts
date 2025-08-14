// Centralized, strict environment configuration for the frontend.
// All required env vars must be set; no defaults.

function requireEnv(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Public env (exposed to browser). Must use NEXT_PUBLIC_* names. Must be truthy.
export const publicEnv = {
  clerkPublishableKey: requireEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
} as const;


export type PublicEnv = typeof publicEnv;


