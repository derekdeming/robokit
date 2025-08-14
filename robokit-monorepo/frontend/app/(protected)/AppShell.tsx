'use client';

import { Navigation } from '@/components/layout/navigation';
import { useUIStore } from '@/lib/stores/ui-store';
import { cn } from '@/lib/utils';
import { Menu } from 'lucide-react';
import { useEffect, useState } from 'react';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="lg:hidden sticky top-0 z-30 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
          <div className="px-4 h-12 flex items-center">
            <button
              className="p-2 rounded-md border cursor-pointer opacity-50"
              aria-label="Toggle sidebar"
              disabled
            >
              <Menu size={20} />
            </button>
          </div>
        </div>
        <main className={cn('transition-all duration-200 lg:ml-64')}>
          <div className="p-6">{children}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="lg:hidden sticky top-0 z-30 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="px-4 h-12 flex items-center">
          <button
            onClick={toggleSidebar}
            className="p-2 rounded-md border cursor-pointer"
            aria-label="Toggle sidebar"
          >
            <Menu size={20} />
          </button>
        </div>
      </div>
      <main className={cn('transition-all duration-200 lg:ml-64')}>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}