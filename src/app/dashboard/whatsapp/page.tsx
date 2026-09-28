import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import {
  MessageCircle,
  Users,
  PackageCheck,
  BellRing,
  Percent,
  ShieldCheck,
  Lock,
  Phone,
  Webhook,
  KeyRound,
  Activity,
} from "lucide-react";
import { requireAuthenticatedUser } from "@/services/auth";
import { getOrdersForRole } from "@/services/operations";
import { isOrdersInProgressStatus } from "@/lib/orders-view-filters";
import { prisma } from "@/lib/db";
import { WhatsAppDemo } from "@/components/whatsapp/whatsapp-demo";

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "success" | "accent";
}) {
  const iconCls =
    tone === "success"
      ? "bg-success/15 text-success"
      : tone === "accent"
        ? "bg-[#25D366]/15 text-[#25D366]"
        : "bg-primary/15 text-primary";
  return (
    <Card className="glass-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconCls}`}>
          <Icon size={17} />
        </span>
      </div>
      <p className="text-2xl font-bold tracking-tight text-white">{value}</p>
      <p className="mt-0.5 text-sm font-medium text-white/85">{label}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p>
    </Card>
  );
}

function Field({
  icon: Icon,
  label,
  placeholder,
}: {
  icon: typeof Phone;
  label: string;
  placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Icon size={12} /> {label}
      </label>
      <input
        disabled
        readOnly
        value={placeholder}
        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-muted-foreground outline-none"
      />
    </div>
  );
}

export default async function WhatsAppPage() {
  const { profile } = await requireAuthenticatedUser();

  let orders: Awaited<ReturnType<typeof getOrdersForRole>> = [];
  let reachable = 0;
  let activeCustomers = 0;

  try {
    const [scopedOrders, customers] = await Promise.all([
      getOrdersForRole(profile, { balanced: false, limit: 5000 }),
      prisma.customer.findMany({ select: { phone: true, status: true } }),
    ]);
    orders = scopedOrders;
    activeCustomers = customers.filter((c) => c.status === "ACTIVE").length;
    reachable = customers.filter((c) => c.status === "ACTIVE" && c.phone && c.phone.trim()).length;
  } catch (error) {
    console.error("WhatsApp metrics failed:", error);
  }

  const awaiting = orders.filter((o) => isOrdersInProgressStatus(o.status)).length;
  const delivered = orders.filter((o) => o.status === "DELIVERED").length;
  const optIn = activeCustomers > 0 ? (reachable / activeCustomers) * 100 : 0;

  // Projected volume is anchored to real order intake, not random numbers.
  const daily: Array<{ date: string; count: number }> = [];
  const buckets = new Map<string, number>();
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const o of orders) {
    const key = o.created_at.slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  for (const [date, count] of buckets) daily.push({ date, count });
  const peak = Math.max(1, ...daily.map((d) => d.count));

  const projected = orders.length;
  const deliveredPct = 97;
  const readPct = 83;
  const replyPct = 31;

  // Anchor the demo to one real, in-scope order — line items and all — so the
  // product-aware templates quote actual SKUs instead of placeholder text.
  const inScope = orders.find((o) => isOrdersInProgressStatus(o.status)) ?? orders[0];

  let items: Array<{ name: string; sku: string; qty: number }> = [];
  let warehouse = "your warehouse";
  if (inScope) {
    try {
      const row = await prisma.order.findUnique({
        where: { id: inScope.id },
        select: {
          warehouse: { select: { name: true } },
          items: {
            select: { quantity: true, product: { select: { name: true, sku: true } } },
            orderBy: { quantity: "desc" },
            take: 6,
          },
        },
      });
      warehouse = row?.warehouse?.name || warehouse;
      items = (row?.items ?? [])
        .filter((i) => i.product)
        .map((i) => ({ name: i.product.name, sku: i.product.sku, qty: i.quantity }));
    } catch (error) {
      console.error("WhatsApp demo line items failed:", error);
    }
  }

  const delivery = inScope?.expected_delivery_date
    ? new Date(inScope.expected_delivery_date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "TBD";

  const demoContext = {
    orderNumber: inScope?.order_number ?? "ORD-0000",
    customerName: inScope?.customer_name ?? "Valued customer",
    amount: `$${Number(inScope?.order_value ?? 0).toLocaleString("en-US")}`,
    deliveryDate: delivery,
    warehouse,
    items,
  };

  const hasScope = profile.role === "admin" || Boolean(profile.warehouse_id);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#0B141A] via-[#0E1A16] to-[#0A0A0A] p-6 lg:p-8">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-30 blur-3xl"
          style={{ backgroundColor: "#25D366" }}
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#25D366] text-[#063B24]">
                <MessageCircle size={20} />
              </span>
              <h1 className="text-3xl font-bold tracking-tight text-white">WhatsApp</h1>
            </div>
            <p className="max-w-xl text-sm text-muted-foreground">
              Order notifications, delivery updates and customer replies on the channel your
              customers already have open.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-white/15 bg-white/10 text-white">Demo workspace</Badge>
            <Badge
              className={
                hasScope
                  ? "border-[#25D366]/30 bg-[#25D366]/15 text-[#25D366]"
                  : "border-amber-400/30 bg-amber-400/15 text-amber-300"
              }
            >
              {hasScope
                ? profile.role === "admin"
                  ? "All warehouses"
                  : "Your warehouse only"
                : "No warehouse assigned"}
            </Badge>
          </div>
        </div>
      </div>

      {/* Analytics */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-primary" />
            <h2 className="text-lg font-semibold text-white">Analytics</h2>
          </div>
          <Badge className="border-[#25D366]/30 bg-[#25D366]/15 text-[#25D366]">
            Live · from your order and customer data
          </Badge>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            icon={Users}
            label="Reachable contacts"
            value={reachable.toLocaleString()}
            hint="Active customers with a phone number on file."
            tone="accent"
          />
          <Stat
            icon={BellRing}
            label="Awaiting an update"
            value={awaiting.toLocaleString()}
            hint="In-scope orders sitting in an active status right now."
          />
          <Stat
            icon={PackageCheck}
            label="Delivered orders"
            value={delivered.toLocaleString()}
            hint="Eligible for a delivery confirmation message."
            tone="success"
          />
          <Stat
            icon={Percent}
            label="Contact coverage"
            value={`${optIn.toFixed(1)}%`}
            hint="Share of active customers reachable by number."
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="glass-card p-6 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-white">
                Order intake · last 7 days
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {daily.reduce((s, d) => s + d.count, 0)} orders
              </span>
            </div>
            {daily.every((d) => d.count === 0) ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No orders created in this window.
              </p>
            ) : (
              <div className="flex h-40 items-end gap-3">
                {daily.map((d) => (
                  <div key={d.date} className="group flex flex-1 flex-col items-center gap-2">
                    <span className="text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                      {d.count}
                    </span>
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-[#25D366] to-[#5BF09A] transition-all group-hover:opacity-100"
                      style={{
                        height: `${Math.max(4, (d.count / peak) * 100)}%`,
                        opacity: d.count === 0 ? 0.25 : 0.9,
                      }}
                      title={`${d.date}: ${d.count} order(s)`}
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(`${d.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="glass-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-white">
                Funnel
              </CardTitle>
              <Badge className="border-white/15 bg-white/10 text-muted-foreground">Estimate</Badge>
            </div>
            <ul className="space-y-4">
              {[
                { label: "Sent", value: projected, pct: 100, cls: "bg-[#25D366]" },
                { label: "Delivered", value: Math.round((projected * deliveredPct) / 100), pct: deliveredPct, cls: "bg-[#5BF09A]" },
                { label: "Read", value: Math.round((projected * readPct) / 100), pct: readPct, cls: "bg-primary" },
                { label: "Replied", value: Math.round((projected * replyPct) / 100), pct: replyPct, cls: "bg-violet-400" },
              ].map((row) => (
                <li key={row.label}>
                  <div className="mb-1.5 flex items-baseline justify-between text-xs">
                    <span className="text-white/85">{row.label}</span>
                    <span className="text-muted-foreground">
                      {row.value.toLocaleString()} · {row.pct}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full rounded-full ${row.cls}`} style={{ width: `${row.pct}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
              Projected from your {projected.toLocaleString()} in-scope orders. Real rates replace
              this once a WhatsApp Business account is connected.
            </p>
          </Card>
        </div>
      </section>

      {/* Demo */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageCircle size={16} className="text-[#25D366]" />
            <h2 className="text-lg font-semibold text-white">Demo</h2>
          </div>
          <Badge className="border-white/15 bg-white/10 text-muted-foreground">
            Interactive · nothing leaves this browser
          </Badge>
        </div>
        <Card className="glass-card p-6 lg:p-8">
          <WhatsAppDemo context={demoContext} />
        </Card>
      </section>

      {/* Configure */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <KeyRound size={16} className="text-primary" />
            <h2 className="text-lg font-semibold text-white">Configure account</h2>
          </div>
          <Badge className="border-white/15 bg-white/10 text-muted-foreground">Admin only</Badge>
        </div>

        <Card className="glass-card relative overflow-hidden border-white/10 p-6 lg:p-8">
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-20 blur-3xl"
            style={{ backgroundColor: "#25D366" }}
          />

          <div className="relative">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-muted-foreground">
                  <Lock size={18} />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-white">WhatsApp Business Cloud API</h3>
                  <p className="text-sm text-muted-foreground">
                    Connect a phone number to send live notifications.
                  </p>
                </div>
              </div>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white">
                Coming Soon
              </span>
            </div>

            <div className="grid gap-5 opacity-60 sm:grid-cols-2">
              <Field icon={Phone} label="Business phone number" placeholder="+91 00000 00000" />
              <Field icon={KeyRound} label="Permanent access token" placeholder="EAAB…" />
              <Field icon={ShieldCheck} label="Phone number ID" placeholder="1093…" />
              <Field icon={Webhook} label="Webhook callback URL" placeholder="https://api.opsmind.ai/whatsapp/webhook" />
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                This panel is under development. When it ships you will be able to register a
                Meta-approved number, upload message templates, and map order status transitions to
                them — all without leaving OpsMind.
              </p>
              <button
                type="button"
                disabled
                className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-muted-foreground"
              >
                <Lock size={14} /> Connect account
              </button>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
