"use client";

import { Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import type { UserProfile } from "@/types/auth";
import { LogoutButton } from "./logout-button";

interface TopNavProps {
  profile: UserProfile;
}

export function TopNav({ profile }: TopNavProps) {
  const displayName = profile.full_name?.trim() || profile.email.split("@")[0] || "SRL User";

  return (
    <motion.header
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border border-border/40 bg-background/95 px-5 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/60"
    >
      <div className="flex min-w-0 items-center gap-3 justify-self-start">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-500">
          <Sparkles size={18} />
        </div>
      </div>

      <h2 className="max-w-[min(420px,70vw)] truncate text-center text-[16px] font-semibold tracking-tight text-foreground justify-self-center">
        {displayName}
      </h2>

      <div className="flex flex-wrap items-center justify-end gap-4 justify-self-end">
        <div className="hidden sm:flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-2 py-1">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
          Systems Online
        </div>
        <div className="hidden sm:block h-4 w-px bg-border/60" />
        <LogoutButton />
      </div>
    </motion.header>
  );
}
