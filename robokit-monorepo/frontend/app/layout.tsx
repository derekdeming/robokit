import { publicEnv } from "@/lib/config";
import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClientProviders } from './client-providers';
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RoboKit - Robot Dataset Management",
  description: "Upload, inspect, and convert multi-terabyte robot sensor datasets",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const publishableKey = publicEnv.clerkPublishableKey;
  
  return (
    <ClerkProvider 
      publishableKey={publishableKey}
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
      afterSignOutUrl="/welcome"
      appearance={{
        baseTheme: undefined,
      }}
    >
      <html lang="en" suppressHydrationWarning>
        <head>
          <meta name="color-scheme" content="dark light" />
          <script
            dangerouslySetInnerHTML={{
              __html: `(() => {
  try {
    const storageKey = 'robokit-ui-theme';
    const stored = localStorage.getItem(storageKey);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolved = stored === 'dark' || stored === 'light' ? stored : (prefersDark ? 'dark' : 'light');
    const root = document.documentElement;
    root.classList.remove('light','dark');
    root.classList.add(resolved);
  } catch (_) {}
})();`,
            }}
          />
        </head>
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
          <ClientProviders>{children}</ClientProviders>
        </body>
      </html>
    </ClerkProvider>
  );
}
