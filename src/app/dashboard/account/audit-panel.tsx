"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  ShoppingCart,
  MessageSquare,
  ShieldCheck,
  KeyRound,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type AuditEvent = {
  id: string;
  type: "order" | "chat" | "role" | "provider";
  action: string;
  detail: string;
  actor: string;
  at: string;
};

const TYPE_META: Record<AuditEvent["type"], { icon: typeof Activity; cls: string }> = {
  order: { icon: ShoppingCart, cls: "bg-primary/15 text-primary border-primary/25" },
  chat: { icon: MessageSquare, cls: "bg-sky-400/15 text-sky-300 border-sky-400/25" },
  role: { icon: ShieldCheck, cls: "bg-amber-400/15 text-amber-300 border-amber-400/25" },
  provider: { icon: KeyRound, cls: "bg-emerald-400/15 text-emerald-300 border-emerald-400/25" },
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())} ${d.toLocaleString("en-US", { month: "short" })} ${d.getFullYear()} · ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function AuditPanel({ isAdmin }: { isAdmin: boolean }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [scope, setScope] = useState<string>("own");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/settings/audit")
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load");
        return res.json();
      })
      .then((json) => {
        if (!active) return;
        setEvents(json.events ?? []);
        setScope(json.scope ?? "own");
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-2xl font-bold text-white">Audit Logs</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {isAdmin
              ? "Full activity timeline across orders, assistant queries, roles and providers."
              : "Your own recent activity. Admins see the full timeline."}
          </p>
        </div>
        <Badge className={isAdmin ? "bg-primary/15 text-primary border-primary/25" : "bg-white/10 text-muted-foreground border-white/15"}>
          {isAdmin ? "All activity" : "Your activity"}
        </Badge>
      </div>

      <Card className="glass-card p-6 border-white/10">
        {loading ? (
          <div className="flex items-center gap-2 py-12 text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> Loading audit trail…
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 py-12 text-rose-300">
            <AlertCircle size={16} /> {error}
          </div>
        ) : events.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No activity recorded{scope === "own" ? " for your account" : ""} yet.
          </div>
        ) : (
          <ol className="relative space-y-4 border-l border-white/10 pl-6">
            {events.map((ev) => {
              const meta = TYPE_META[ev.type] ?? TYPE_META.order;
              const Icon = meta.icon;
              return (
                <li key={ev.id} className="relative">
                  <span
                    className={`absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full border ${meta.cls}`}
                  >
                    <Icon size={12} />
                  </span>
                  <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-white">{ev.action}</p>
                      <span className="text-xs text-muted-foreground">{formatWhen(ev.at)}</span>
                    </div>
                    <p className="mt-1 break-words text-sm text-white/80">{ev.detail}</p>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      actor: {ev.actor}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </div>
  );
}
