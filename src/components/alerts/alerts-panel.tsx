"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { createSupabaseBrowserClient } from "@/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

interface AlertRecord {
  id: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  status: string;
  created_at: string;
}

interface AlertsPanelProps {
  initialAlerts: AlertRecord[];
}

const severityVariant: Record<AlertRecord["severity"], "secondary" | "warning" | "danger"> = {
  low: "secondary",
  medium: "warning",
  high: "danger",
  critical: "danger",
};

export function AlertsPanel({ initialAlerts }: AlertsPanelProps) {
  const [alerts, setAlerts] = useState(initialAlerts);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("alerts-stream")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alerts" },
        (payload) => {
          const next = payload.new as AlertRecord;
          setAlerts((prev) => [next, ...prev].slice(0, 50));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <Card>
      <CardTitle className="mb-2 flex items-center gap-2">
        <AlertTriangle className="text-amber-300" size={18} />
        Operational Signals
      </CardTitle>
      <CardDescription className="mb-4">Realtime alerts from supply chain and warehouse flow</CardDescription>
      <div className="space-y-3">
        {alerts.map((alert) => (
          <div key={alert.id} className="rounded-lg border border-border/70 bg-slate-950/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">{alert.title}</p>
              <Badge variant={severityVariant[alert.severity] ?? "secondary"}>{alert.severity}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {new Date(alert.created_at).toLocaleString()} - {alert.status}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
