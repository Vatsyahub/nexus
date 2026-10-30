"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  FileText,
  Home,
  CreditCard,
  Wallet,
  ListTodo,
  CalendarDays,
  Package,
  Users,
  Settings,
  BarChart3,
  Shield,
  Menu,
} from "lucide-react";
import {
  type ClearanceRole,
  type NavClearance,
} from "@/lib/clearance";
import {
  defaultAccess,
  doorForPath,
  levelForPath,
  type AccessMap,
} from "@/lib/access";
import { AccessBanner } from "@/components/access-banner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SignOutButton } from "@/components/sign-out-button";
import { HubBackButton } from "@/components/hub-back-button";
import { NotificationBell } from "@/components/notification-bell";
import { useState } from "react";

const nav: {
  href: string;
  label: string;
  icon: typeof Home;
  live: boolean;
  clearance: NavClearance;
}[] = [
  { href: "/", label: "Home", icon: Home, live: true, clearance: "everyone" },
  {
    href: "/contracts",
    label: "Contracts",
    icon: FileText,
    live: true,
    clearance: "everyone",
  },
  {
    href: "/billing",
    label: "Billing",
    icon: CreditCard,
    live: true,
    clearance: "everyone",
  },
  {
    href: "/payments",
    label: "Payments",
    icon: Wallet,
    live: true,
    clearance: "everyone",
  },
  {
    href: "/tasks",
    label: "Tasks",
    icon: ListTodo,
    live: true,
    clearance: "everyone",
  },
  {
    href: "/schedules",
    label: "Schedules",
    icon: CalendarDays,
    live: true,
    clearance: "everyone",
  },
  {
    href: "/operations",
    label: "Operations",
    icon: Package,
    live: true,
    clearance: "everyone",
  },
  {
    href: "/reports",
    label: "Reports",
    icon: BarChart3,
    live: true,
    clearance: "everyone",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    live: true,
    clearance: "everyone",
  },
  {
    href: "/users",
    label: "User management",
    icon: Users,
    live: true,
    clearance: "master",
  },
  {
    href: "/nexus-core",
    label: "Nexus Core",
    icon: Shield,
    live: true,
    clearance: "master_director",
  },
];

function NavLinks({
  onNavigate,
  access,
}: {
  onNavigate?: () => void;
  access: AccessMap;
}) {
  const pathname = usePathname();
  const items = nav.filter((item) => {
    if (item.href === "/reports") return levelForPath("/reports", access) !== "block";
    const door = doorForPath(item.href);
    if (!door) return false;
    return access[door] !== "block";
  });
  return (
    <nav className="flex flex-col gap-1 p-3 pt-8">
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : item.href === "/operations"
              ? pathname.startsWith("/operations") ||
                pathname.startsWith("/expenses")
              : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-[var(--fh-accent)] text-[var(--fh-ink)]"
                : "text-white/75 hover:bg-white/5 hover:text-white"
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {!item.live && (
              <span className="text-[10px] uppercase tracking-wide text-white/60">
                soon
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);

  if (pathname.startsWith("/login")) {
    return <>{children}</>;
  }

  // Session is hydrated from the server — never block the whole app on
  // client refetch (that was leaving users stuck on "Loading Nexus…").
  const role: ClearanceRole = session?.user?.clearance ?? "user";
  const access = session?.user?.access ?? defaultAccess(role);
  const displayName = session?.user?.name ?? session?.user?.email ?? "Signed in";
  const nexusHome = pathname === "/nexus-core";

  return (
    <div className="nexus-shell relative z-[1] h-dvh overflow-hidden bg-[var(--fh-bg)] text-[var(--fh-ink)]">
      <div className="flex h-full min-h-0 overflow-hidden">
        <aside className="hidden h-full w-60 shrink-0 flex-col border-r border-white/10 bg-[var(--fh-steel)] text-white lg:flex">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <NavLinks access={access} />
          </div>
          <div className="shrink-0 border-t border-white/10 px-2 py-2 text-xs text-white/60">
            <div className="flex items-center gap-1 px-1">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-white/85">
                  {displayName}
                </p>
                <p className="capitalize text-white/70">{role}</p>
              </div>
              <NotificationBell variant="dark" />
            </div>
          </div>
          <div className="shrink-0 border-t border-white/10 px-2 py-2">
            <SignOutButton className="h-8 w-full justify-start px-2 text-xs text-white/70 hover:bg-white/5 hover:text-white" />
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center gap-3 border-b border-[var(--fh-line)] bg-white/70 px-4 py-3 backdrop-blur lg:hidden">
            <Button
              variant="outline"
              size="icon"
              aria-label="Open menu"
              onClick={() => setOpen(true)}
            >
              <Menu className="size-4" />
            </Button>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetContent
                side="left"
                className="w-72 border-white/10 bg-[var(--fh-steel)] p-0 text-white"
              >
                <NavLinks access={access} onNavigate={() => setOpen(false)} />
                <div className="border-t border-white/10 px-3 py-3 text-xs text-white/60">
                  <p className="truncate px-2 font-medium text-white/85">
                    {displayName}
                  </p>
                  <SignOutButton className="mt-2 w-full justify-start text-white/70 hover:bg-white/5 hover:text-white" />
                </div>
              </SheetContent>
            </Sheet>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] text-[var(--fh-ink)]/70">
                {displayName}
              </p>
            </div>
            <NotificationBell variant="light" />
          </header>

          <main
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-hidden",
              nexusHome
                ? "p-2 sm:p-3"
                : pathname === "/"
                  ? "p-3 sm:p-4 lg:p-5"
                  : "p-4 sm:p-6 lg:p-8"
            )}
          >
            <AccessBanner />
            {nexusHome ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {children}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                {children}
              </div>
            )}
          </main>
          <HubBackButton />
          <footer
            className={cn(
              "shrink-0 border-t border-[var(--fh-line)] text-center text-[var(--fh-muted)] sm:px-6 lg:px-8",
              nexusHome || pathname === "/"
                ? "px-4 py-1.5 text-[10px]"
                : "px-4 py-3 text-[11px]"
            )}
          >
            A product of Cradle Runways (I) Pvt. Ltd. , developed by Rahul Vatsyayan
          </footer>
        </div>
      </div>
    </div>
  );
}
