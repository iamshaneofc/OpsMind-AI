"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Lightbulb,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { OperationalTip } from "@/types/operations";
import { cn } from "@/utils/cn";

const severityStyles: Record<
  OperationalTip["severity"],
  { badge: string; border: string; glow: string; icon: string }
> = {
  critical: {
    badge: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    border: "border-rose-500/25 hover:border-rose-400/40",
    glow: "from-rose-500/15",
    icon: "bg-rose-500/15 text-rose-300",
  },
  high: {
    badge: "bg-amber-400/15 text-amber-200 border-amber-400/30",
    border: "border-amber-400/20 hover:border-amber-300/35",
    glow: "from-amber-400/15",
    icon: "bg-amber-400/15 text-amber-200",
  },
  medium: {
    badge: "bg-sky-400/15 text-sky-200 border-sky-400/30",
    border: "border-sky-400/20 hover:border-sky-300/35",
    glow: "from-sky-400/10",
    icon: "bg-sky-400/15 text-sky-200",
  },
  low: {
    badge: "bg-emerald-400/15 text-emerald-200 border-emerald-400/30",
    border: "border-emerald-400/20 hover:border-emerald-300/35",
    glow: "from-emerald-400/10",
    icon: "bg-emerald-400/15 text-emerald-200",
  },
};

export function OperationalTips({
  tips,
  industryLabel,
  companyName,
}: {
  tips: OperationalTip[];
  industryLabel: string;
  companyName?: string;
}) {
  const router = useRouter();

  const askBot = (prompt: string) => {
    router.push(`/dashboard/chatbot?ask=${encodeURIComponent(prompt)}`);
  };

  if (!tips.length) {
    return (
      <Card className="glass-card border-emerald-500/20 p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
            <Sparkles size={18} />
          </div>
          <div>
            <CardTitle className="text-base text-white">All clear for now</CardTitle>
            <CardDescription className="mt-1.5 text-sm leading-relaxed">
              {companyName ?? industryLabel} operations look stable. Ask OpsMind for a proactive health
              check or weekly improvement ideas.
            </CardDescription>
            <Link
              href="/dashboard/chatbot?ask=Give%20me%20today%27s%20operational%20tips"
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              Ask OpsMind <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300">
            <Lightbulb size={16} />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-white">
              Today&apos;s tips
            </h2>
            <p className="text-xs text-muted-foreground">
              Live priorities for {companyName ?? industryLabel} · {industryLabel}
            </p>
          </div>
        </div>
        <Badge className="border-white/10 bg-white/5 text-white/70">
          {tips.length} insight{tips.length === 1 ? "" : "s"}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {tips.map((tip, idx) => {
          const style = severityStyles[tip.severity];
          return (
            <Card
              key={tip.id}
              className={cn(
                "relative flex flex-col gap-3 overflow-hidden border bg-white/[0.03] p-5 transition-all hover:-translate-y-0.5 hover:bg-white/[0.05]",
                style.border,
              )}
            >
              <div
                className={cn(
                  "pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b to-transparent opacity-80",
                  style.glow,
                )}
              />
              <div className="relative flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                      style.icon,
                    )}
                  >
                    {idx + 1}
                  </span>
                  <CardTitle className="text-base font-semibold leading-snug text-white">
                    {tip.title}
                  </CardTitle>
                </div>
                <Badge className={cn("shrink-0 capitalize", style.badge)}>
                  {tip.severity}
                </Badge>
              </div>

              <p className="relative text-sm leading-relaxed text-muted-foreground">
                <span className="font-medium text-white/75">Why it matters: </span>
                {tip.why}
              </p>

              <div className="relative rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
                <p className="text-sm leading-relaxed text-white/90">
                  <span className="inline-flex items-center gap-1.5 font-medium text-amber-200">
                    <AlertTriangle size={12} />
                    Do this
                  </span>
                  <span className="mt-1 block">{tip.action}</span>
                </p>
              </div>

              {tip.evidence ? (
                <p className="relative text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Evidence · {tip.evidence}
                </p>
              ) : null}

              <button
                type="button"
                onClick={() => askBot(tip.askPrompt)}
                className="relative mt-auto inline-flex w-fit items-center gap-2 rounded-lg bg-primary/15 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/25"
              >
                <MessageSquare size={13} />
                Dig deeper with OpsMind
              </button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
