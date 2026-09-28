"use client";

import { useEffect, useState } from "react";
import { Building2, Warehouse, ShieldCheck, Users, MapPin, Loader2, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type WorkspaceData = {
  email: string;
  fullName: string;
  role: string;
  company: { id: string; name: string; code: string | null } | null;
  warehouse: { id: string; name: string; location: string } | null;
  warehouses: Array<{ id: string; name: string; location: string }>;
  stats: { memberCount: number; roleCount: number; warehouseCount: number };
};

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon size={14} />
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-white">{value}</p>
    </div>
  );
}

export function WorkspacePanel() {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/settings/workspace")
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load");
        return res.json();
      })
      .then((json) => active && setData(json))
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 text-muted-foreground">
        <Loader2 size={16} className="animate-spin" /> Loading workspace…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 py-16 text-rose-300">
        <AlertCircle size={16} /> {error || "Workspace unavailable"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold text-white">Workspace</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Your organisation, warehouse assignment and workspace headcount.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile icon={Users} label="Members" value={data.stats.memberCount} />
        <StatTile icon={Warehouse} label="Warehouses" value={data.stats.warehouseCount} />
        <StatTile icon={ShieldCheck} label="Roles in use" value={data.stats.roleCount} />
      </div>

      <Card className="glass-card p-6 border-white/10 space-y-5">
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Organisation</p>
            {data.company ? (
              <div className="mt-1.5">
                <p className="text-lg font-semibold text-white">{data.company.name}</p>
                {data.company.code ? (
                  <Badge className="mt-1 bg-primary/15 text-primary border-primary/25">{data.company.code}</Badge>
                ) : null}
              </div>
            ) : (
              <p className="mt-1.5 text-sm text-muted-foreground">
                Not assigned to a company — you have org-wide visibility.
              </p>
            )}
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Your warehouse</p>
            {data.warehouse ? (
              <div className="mt-1.5">
                <p className="text-lg font-semibold text-white">{data.warehouse.name}</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin size={13} /> {data.warehouse.location}
                </p>
              </div>
            ) : (
              <p className="mt-1.5 text-sm text-muted-foreground">
                No warehouse assigned — data scope is organisation-wide.
              </p>
            )}
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Your role</p>
            <Badge className="mt-1.5 bg-success/15 text-success border-success/25 uppercase">
              {data.role}
            </Badge>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Signed in as</p>
            <p className="mt-1.5 text-sm text-white">{data.fullName}</p>
            <p className="text-sm text-muted-foreground">{data.email}</p>
          </div>
        </div>
      </Card>

      <Card className="glass-card p-6 border-white/10">
        <div className="mb-4 flex items-center gap-2">
          <Warehouse size={16} className="text-primary" />
          <h4 className="text-sm font-semibold uppercase tracking-wider text-white">Warehouse network</h4>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {data.warehouses.map((w) => (
            <div
              key={w.id}
              className={`rounded-lg border px-4 py-3 ${
                data.warehouse?.id === w.id
                  ? "border-primary/40 bg-primary/10"
                  : "border-white/10 bg-white/[0.02]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-white">{w.name}</p>
                {data.warehouse?.id === w.id ? (
                  <Badge className="bg-primary/20 text-primary border-primary/30">Yours</Badge>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{w.location}</p>
            </div>
          ))}
          {data.warehouses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No warehouses configured.</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
