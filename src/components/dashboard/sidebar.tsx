"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import type { AppRole } from "@/types/auth";
import { cn } from "@/utils/cn";
import { getNavItems } from "@/components/dashboard/nav-items";

interface SidebarProps {
  role: AppRole;
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const navItems = getNavItems(role);

  return (
    <aside className="glass-panel fixed left-4 top-4 z-20 hidden h-[calc(100vh-2rem)] w-[260px] rounded-2xl p-4 lg:block">
      <div className="mb-8 flex items-center gap-3 rounded-lg border border-teal-500/20 bg-teal-500/10 p-3">
        <Sparkles className="text-teal-500" size={20} />
        <div>
          <p className="text-sm font-semibold tracking-tight">SRL AI</p>
          <p className="text-[11px] tracking-wide text-muted-foreground">Intelligence core</p>
        </div>
      </div>
      <nav className="space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors font-medium",
                active
                  ? "bg-teal-500/15 text-teal-600 dark:text-teal-400"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon size={16} />
              {item.name}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
