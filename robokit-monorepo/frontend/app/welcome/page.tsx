import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { WelcomeClient } from './WelcomeClient';

export default async function Welcome() {
  const { userId } = await auth();
  if (userId) {
    redirect('/dashboard');
  }
  return <WelcomeClient />;
}
