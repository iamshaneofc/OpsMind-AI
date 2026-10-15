"use client";

import { Activity } from "lucide-react";
import { motion } from "framer-motion";
import type { UserProfile } from "@/types/auth";
import { INDUSTRIES, type IndustryId } from "@/lib/industry";
import { LogoutButton } from "./logout-button";
import { IndustrySwitcher } from "./industry-switcher";

interface TopNavProps {
  profile: UserProfile;
  industry?: IndustryId;
}

export function TopNav({ profile, industry }: TopNavProps) {
  const meta = industry ? INDUSTRIES[industry] : null;
  const displayName = profile.full_name?.trim() || profile.email.split("@")[0] || "Admin";

  return (
    <motion.header
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative z-40 mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0b0d12]/90 px-4 py-3 backdrop-blur-xl sm:px-5"
    >
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          OpsMind Admin
        </p>
        <p className="truncate text-sm font-medium text-white/90">
          {displayName}
          {meta ? (
            <span className="text-muted-foreground"> · {meta.shortLabel}</span>
          ) : null}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
        <IndustrySwitcher initialIndustry={industry} />
        <div className="hidden items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300 sm:flex">
          <Activity size={12} className="text-emerald-400" />
          Live
        </div>
        <div className="hidden h-5 w-px bg-white/10 sm:block" />
        <LogoutButton />
      </div>
    </motion.header>
  );
}
