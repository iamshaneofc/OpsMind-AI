"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock3,
  MessageSquare,
  Target,
} from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { OperationalTip } from "@/types/operations";
import { cn } from "@/utils/cn";

const severityRank: Record<OperationalTip["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const severityTone: Record<
  OperationalTip["severity"],
  { badge: string; step: string; ring: string }
> = {
  critical: {
    badge: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    step: "bg-rose-500 text-white",
    ring: "border-rose-500/30",
  },
  high: {
    badge: "bg-amber-400/15 text-amber-200 border-amber-400/30",
    step: "bg-amber-400 text-black",
    ring: "border-amber-400/25",
  },
  medium: {
    badge: "bg-sky-400/15 text-sky-200 border-sky-400/30",
    step: "bg-sky-400 text-black",
    ring: "border-sky-400/25",
  },
  low: {
    badge: "bg-emerald-400/15 text-emerald-200 border-emerald-400/30",
    step: "bg-emerald-400 text-black",
    ring: "border-emerald-400/25",
  },
};

function horizonFor(severity: OperationalTip["severity"]) {
  if (severity === "critical") return "Today";
  if (severity === "high") return "This week";
  if (severity === "medium") return "Next 7 days";
  return "This month";
}

function impactFor(severity: OperationalTip["severity"]) {
  if (severity === "critical") return "Protects SLA & cash";
  if (severity === "high") return "Stops revenue leakage";
  if (severity === "medium") return "Improves fill rate";
  return "Builds pipeline";
}

export function NextActionPlan({
  tips,
  companyName,
  fulfillmentRate,
  lowStockCount,
}: {
  tips: OperationalTip[];
  companyName: string;
  fulfillmentRate: number;
  lowStockCount: number;
}) {
  const router = useRouter();
  const plan = [...tips]
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
    .slice(0, 5);

  const askBot = (prompt: string) => {
    router.push(`/dashboard/chatbot?ask=${encodeURIComponent(prompt)}`);
  };

  if (!plan.length) {
    return (
      <Card className="relative overflow-hidden border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-white/[0.03] to-transparent p-6">
        <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-white">
                Next action plan
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {companyName} looks stable — no urgent escalations. Keep monitoring fulfillment and stock.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/chatbot?ask=Give%20me%20a%20weekly%20improvement%20plan"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Build a weekly plan <ArrowRight size={14} />
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-primary/15 via-white/[0.03] to-transparent p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-16 top-0 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
      <div className="relative space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary shadow-[0_8px_24px_-10px_rgba(59,130,246,0.7)]">
              <ClipboardList size={20} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/90">
                Improvement roadmap
              </p>
              <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                Next action plan
              </h2>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Prioritized steps for {companyName} — clear what to do now to lift fulfillment and cash.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="border-white/10 bg-white/5 text-white/80">
              <Target size={12} className="mr-1.5" />
              Fulfillment {fulfillmentRate.toFixed(0)}%
            </Badge>
            <Badge className="border-white/10 bg-white/5 text-white/80">
              {lowStockCount} low SKUs
            </Badge>
          </div>
        </div>

        <ol className="space-y-3">
          {plan.map((tip, idx) => {
            const tone = severityTone[tip.severity];
            return (
              <li
                key={tip.id}
                className={cn(
                  "rounded-xl border bg-black/25 p-4 backdrop-blur-sm transition hover:bg-black/35",
                  tone.ring,
                )}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-1 gap-3">
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                        tone.step,
                      )}
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-white">{tip.title}</p>
                        <Badge className={tone.badge}>{tip.severity}</Badge>
                      </div>
                      <p className="text-sm leading-relaxed text-white/90">
                        <span className="font-medium text-primary/90">Action: </span>
                        {tip.action}
                      </p>
                      <div className="flex flex-wrap gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 size={11} /> {horizonFor(tip.severity)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Target size={11} /> {impactFor(tip.severity)}
                        </span>
                        {tip.evidence ? <span>Evidence · {tip.evidence}</span> : null}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => askBot(tip.askPrompt)}
                    className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white transition hover:border-primary/40 hover:bg-primary/15 hover:text-primary"
                  >
                    <MessageSquare size={13} />
                    Execute with AI
                  </button>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <p className="text-xs text-muted-foreground">
            Work top-down — clearing step 1 usually unlocks the rest of the plan.
          </p>
          <Link
            href={`/dashboard/chatbot?ask=${encodeURIComponent(
              "Walk me through today's next action plan and draft messages for each step",
            )}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            Walk me through the full plan <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}
