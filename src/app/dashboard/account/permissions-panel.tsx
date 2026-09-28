"use client";

import { Check, X, ShieldCheck, Database, PenLine } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getPermissionMatrix } from "@/services/permissions";
import type { AppRole } from "@/types/auth";

function Yes({ ok }: { ok: boolean }) {
  return ok ? (
    <Check size={16} className="mx-auto text-success" aria-label="allowed" />
  ) : (
    <X size={16} className="mx-auto text-muted-foreground/50" aria-label="not allowed" />
  );
}

const ROLE_COLS: Array<{ role: AppRole; label: string }> = [
  { role: "admin", label: "Admin" },
  { role: "manager", label: "Manager" },
  { role: "analyst", label: "Analyst" },
];

export function PermissionsPanel({ currentRole }: { currentRole: string }) {
  const matrix = getPermissionMatrix();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold text-white">Role Permissions</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Generated from the live permission code — this is what is actually enforced, not
          documentation.
        </p>
      </div>

      <Card className="glass-card p-6 border-white/10">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck size={16} className="text-primary" />
          <h4 className="text-sm font-semibold uppercase tracking-wider text-white">
            Section access
          </h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Section
                </th>
                {ROLE_COLS.map((c) => (
                  <th
                    key={c.role}
                    className="w-20 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.sections.map((s) => (
                <tr key={s.key} className="border-b border-white/5 last:border-0">
                  <td className="py-2.5 pr-4 text-white/90">{s.label}</td>
                  <td className="py-2.5 text-center"><Yes ok={s.admin} /></td>
                  <td className="py-2.5 text-center"><Yes ok={s.manager} /></td>
                  <td className="py-2.5 text-center"><Yes ok={s.analyst} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="glass-card p-6 border-white/10">
        <div className="mb-4 flex items-center gap-2">
          <PenLine size={16} className="text-primary" />
          <h4 className="text-sm font-semibold uppercase tracking-wider text-white">
            Write actions
          </h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Capability
                </th>
                <th className="hidden py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:table-cell">
                  Enforced at
                </th>
                {ROLE_COLS.map((c) => (
                  <th
                    key={c.role}
                    className="w-20 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.writes.map((w) => (
                <tr key={w.label} className="border-b border-white/5 last:border-0">
                  <td className="py-2.5 pr-4">
                    <span className="text-white/90">{w.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground sm:hidden">{w.detail}</span>
                  </td>
                  <td className="hidden py-2.5 pr-4 font-mono text-xs text-muted-foreground sm:table-cell">
                    {w.detail}
                  </td>
                  <td className="py-2.5 text-center"><Yes ok={w.admin} /></td>
                  <td className="py-2.5 text-center"><Yes ok={w.manager} /></td>
                  <td className="py-2.5 text-center"><Yes ok={w.analyst} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="glass-card p-6 border-white/10">
        <div className="mb-4 flex items-center gap-2">
          <Database size={16} className="text-primary" />
          <h4 className="text-sm font-semibold uppercase tracking-wider text-white">Data scope</h4>
        </div>
        <div className="space-y-3">
          {matrix.scope.map((s) => (
            <div
              key={s.role}
              className={`flex items-start justify-between gap-4 rounded-lg border px-4 py-3 ${
                currentRole === s.role ? "border-primary/40 bg-primary/10" : "border-white/10 bg-white/[0.02]"
              }`}
            >
              <div>
                <p className="font-medium text-white">
                  {s.label}
                  {currentRole === s.role ? (
                    <Badge className="ml-2 bg-primary/20 text-primary border-primary/30">You</Badge>
                  ) : null}
                </p>
                <p className="text-sm text-muted-foreground">{s.detail}</p>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Enforcement happens server-side in <span className="font-mono">getOrdersForRole</span>{" "}
            and <span className="font-mono">getInventoryForRole</span>; accounts without a
            warehouse resolve to zero rows rather than all rows.
          </p>
        </div>
      </Card>
    </div>
  );
}
