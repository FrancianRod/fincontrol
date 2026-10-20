import Link from "next/link";
import { BottomNav, SidebarNav } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface px-4 py-6 md:flex">
        <Link href="/" className="mb-8 flex items-center gap-2 px-2">
          <span className="grid size-7 place-items-center rounded-lg bg-fg text-sm font-semibold text-bg">f</span>
          <span className="font-semibold tracking-tight">fincontrol</span>
        </Link>
        <SidebarNav />
        <div className="mt-auto px-2">
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header (mobile) */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg/85 px-4 py-3 backdrop-blur md:hidden">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-fg text-sm font-semibold text-bg">f</span>
            <span className="font-semibold tracking-tight">fincontrol</span>
          </Link>
          <ThemeToggle />
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-10">{children}</main>

        <BottomNav />
      </div>
    </div>
  );
}
