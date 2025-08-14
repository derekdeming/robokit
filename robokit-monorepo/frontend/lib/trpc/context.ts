import { auth } from '@clerk/nextjs/server';

export async function createContext() {
  const authData = await auth();
  
  return {
    userId: authData.userId,
    orgId: authData.orgId,
  };
}