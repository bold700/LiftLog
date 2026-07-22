import { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface ShellNavItem {
  label: string;
  icon: ReactNode;
  tabIndex: number;
}

export interface ShellLogAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

interface AppShellProps {
  navItems: ShellNavItem[];
  activeTab: number;
  onNavigate: (tabIndex: number) => void;
  logActions: ShellLogAction[];
  children: ReactNode;
}

/** Responsive app-shell: sidebar op desktop (lg+), bottom-nav + FAB op tablet/mobiel. */
export function AppShell({ navItems, activeTab, onNavigate, logActions, children }: AppShellProps) {
  const LogMenu = ({ trigger }: { trigger: ReactNode }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-52">
        {logActions.map((a) => (
          <DropdownMenuItem key={a.label} onSelect={a.onClick} className="gap-2.5 py-2.5">
            <span className="flex h-4 w-4 items-center justify-center text-muted-foreground">{a.icon}</span>
            {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      {/* ---- Sidebar (desktop) ---- */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-border px-5">
          <span className="text-base font-semibold tracking-tight">Van As PT</span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItems.map((item) => {
            const active = item.tabIndex === activeTab;
            return (
              <button
                key={item.tabIndex}
                type="button"
                onClick={() => onNavigate(item.tabIndex)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground'
                )}
              >
                <span className="flex h-5 w-5 items-center justify-center">{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <LogMenu
            trigger={
              <Button className="w-full gap-2">
                <Plus className="h-4 w-4" />
                Log toevoegen
              </Button>
            }
          />
        </div>
      </aside>

      {/* ---- Content ---- */}
      <main className="lg:pl-64">
        <div
          className="mx-auto w-full max-w-5xl px-4 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6 lg:pb-10"
        >
          {children}
        </div>
      </main>

      {/* ---- FAB (tablet/mobiel) ---- */}
      <div
        className="fixed right-4 z-50 lg:hidden"
        style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <LogMenu
          trigger={
            <Button
              size="icon"
              aria-label="Log toevoegen"
              className="h-14 w-14 rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95"
            >
              <Plus className="h-6 w-6" />
            </Button>
          }
        />
      </div>

      {/* ---- Bottom-nav (tablet/mobiel) ---- */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="mx-auto flex max-w-3xl items-stretch justify-around">
          {navItems.map((item) => {
            const active = item.tabIndex === activeTab;
            return (
              <button
                key={item.tabIndex}
                type="button"
                onClick={() => onNavigate(item.tabIndex)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-[3.5rem] flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[0.7rem] font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span className="flex h-5 w-5 items-center justify-center">{item.icon}</span>
                <span className="leading-none">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
