'use client';

import { cn } from '@/lib/utils';
import { useUIStore } from '@/lib/stores/ui-store';
import { useUser, UserButton } from '@clerk/nextjs';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { SettingsMenu } from '@/components/ui/settings-menu';
import { LayoutDashboard, Upload, Database, BarChart3 } from 'lucide-react';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { id: 'upload', label: 'Upload', icon: Upload, href: '/upload' },
  { id: 'datasets', label: 'Datasets', icon: Database, href: '/datasets' },
  { id: 'visualization', label: 'Visualization', icon: BarChart3, href: '/visualization' },
] as const;

export function Navigation() {
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useUIStore();
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setSidebarOpen]);

  return (
    <>
      <nav className={cn(
        'fixed left-0 top-0 h-full w-64 bg-background border-r transition-transform duration-200 z-40 flex flex-col',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        <div className="p-6">
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-fuchsia-600 text-transparent bg-clip-text drop-shadow-lg mb-2">
            RoboKit
          </h1>
        </div>

        <div className="px-3 space-y-1 flex-1">
          {navItems.map(({ id, label, icon: Icon, href }) => (
            <button
              key={id}
              onClick={() => router.push(href)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer',
                pathname === href
                  ? 'bg-primary text-primary-foreground' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </div>
        <div className="p-4 border-t bg-gradient-to-t from-muted/30 to-transparent">
          <div className="space-y-3">
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-card/50 backdrop-blur-sm border border-border/50 shadow-sm hover:bg-card/70 transition-all duration-200">
              {isLoaded && user ? (
                <>
                  <div className="relative">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 to-fuchsia-600/20 rounded-full blur opacity-60"></div>
                    <UserButton 
                      appearance={{
                        elements: {
                          avatarBox: "w-10 h-10 relative border-2 border-background"
                        }
                      }}
                    />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {user.firstName} {user.lastName}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {user.emailAddresses[0]?.emailAddress}
                    </span>
                  </div>
                  <SettingsMenu />
                </>
              ) : (
                <>
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-muted-foreground/20 to-muted-foreground/10 animate-pulse" />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1 gap-1">
                    <div className="h-3.5 w-28 bg-muted-foreground/20 rounded animate-pulse" />
                    <div className="h-2.5 w-36 bg-muted-foreground/20 rounded animate-pulse" />
                  </div>
                  <div className="w-8 h-8 rounded bg-muted-foreground/10 animate-pulse" />
                </>
              )}
            </div>
            
            <div className="flex items-center justify-between px-3 text-xs text-muted-foreground">
              <span className="font-medium">RoboKit v0.1</span>
              <button 
                className="hover:text-foreground transition-colors duration-200"
                onClick={() => window.open('https://github.com/ben-z/robokit-monorepo', '_blank')}
              >
                Docs
              </button>
            </div>
          </div>
        </div>
      </nav>

      {sidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/20 z-30 cursor-pointer"
          onClick={toggleSidebar}
        />
      )}
    </>
  );
}