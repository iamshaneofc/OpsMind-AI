"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import type { AppRole } from "@/types/auth";
import { cn } from "@/utils/cn";
import { getNavItems, NAV_GROUPS } from "@/components/dashboard/nav-items";

interface SidebarProps {
  role: AppRole;
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const navItems = getNavItems(role);

  return (
    <aside className="glass-panel fixed left-4 top-4 z-20 hidden h-[calc(100vh-2rem)] w-[248px] flex-col overflow-hidden rounded-2xl border-white/10 p-3.5 lg:flex">
      <div className="mb-5 flex items-center gap-3 px-1.5 pt-1">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_20px_-8px_rgba(59,130,246,0.75)]">
          <Sparkles size={16} />
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[13px] font-semibold tracking-tight text-white">
            OpsMind AI
          </p>
          <p className="truncate text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Ops core
          </p>
        </div>
      </div>

      <nav className="scrollbar-none min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden pr-0.5">
        {NAV_GROUPS.map((group) => {
          const items = navItems.filter((item) => item.group === group.id);
          if (!items.length) return null;

          return (
            <div key={group.id}>
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href));

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                          active
                            ? "bg-primary/12 text-white"
                            : "text-muted-foreground hover:bg-white/[0.04] hover:text-white",
                        )}
                      >
                        {active ? (
                          <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
                        ) : null}
                        <Icon
                          size={16}
                          strokeWidth={active ? 2.25 : 1.75}
                          className={cn(
                            "shrink-0 transition-colors",
                            active
                              ? "text-primary"
                              : "text-muted-foreground/80 group-hover:text-white/85",
                          )}
                        />
                        <span className="truncate">{item.name}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
