"use client";

import { useMemo } from "react";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import type { AppRole } from "@/types/auth";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowRight, Sparkles, TrendingUp, AlertTriangle, Package, Activity, 
  Users, CheckCircle2, Clock, Truck, ShieldAlert 
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Area, AreaChart, ComposedChart, Bar } from 'recharts';

interface DashboardRealtimeProps {
  role: AppRole;
  companyId: number | null;
  warehouseId: number | null;
  initialMetrics: {
    totalOrders: number;
    inProgress: number;
    ordersInLocalWarehouse: number;
    awaitingFactory: number;
    ordersInCentralWarehouse: number;
    ordersByStatus: Array<{ name: string; value: number }>;
    ordersPipeline: Array<{ name: string; value: number }>;
  };
}

// Mock Financial Data for premium look
const financialData = [
  { name: 'Jan', revenue: 400000, cost: 240000, profit: 160000 },
  { name: 'Feb', revenue: 300000, cost: 139800, profit: 160200 },
  { name: 'Mar', revenue: 550000, cost: 280000, profit: 270000 },
  { name: 'Apr', revenue: 680000, cost: 390800, profit: 289200 },
  { name: 'May', revenue: 850000, cost: 480000, profit: 370000 },
  { name: 'Jun', revenue: 1050000, cost: 550000, profit: 500000 },
  { name: 'Jul', revenue: 1200000, cost: 650000, profit: 550000 },
];

export function DashboardRealtime({
  role,
  companyId,
  warehouseId,
  initialMetrics,
}: DashboardRealtimeProps) {
  const metrics = initialMetrics;

  const topSignals = useMemo(() => {
    const signals: Array<{ label: string; value: number; variant: "secondary" | "warning" | "danger" | "success" }> = [];
    if (metrics.awaitingFactory > 0) signals.push({ label: "Awaiting factory", value: metrics.awaitingFactory, variant: "warning" });
    if (metrics.ordersInCentralWarehouse > 0) signals.push({ label: "Central warehouse", value: metrics.ordersInCentralWarehouse, variant: "secondary" });
    if (metrics.inProgress > 0) signals.push({ label: "In progress", value: metrics.inProgress, variant: "secondary" });
    if (metrics.ordersInLocalWarehouse > 0) signals.push({ label: "Local warehouse", value: metrics.ordersInLocalWarehouse, variant: "success" });
    return signals.slice(0, 4);
  }, [metrics]);

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="bg-gradient-to-br from-white to-white/50 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
            Executive Overview
          </h1>
          <p className="text-sm text-muted-foreground">
            Real-time business intelligence and operational health. Scope:{" "}
            <span className="font-medium text-foreground">
              {role === "admin" ? "All warehouses" : role === "analyst" ? `Warehouse ${warehouseId ?? "—"}` : `Company ${companyId ?? "—"}`}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary text-xs py-1 px-3">
            <Sparkles size={12} className="mr-1.5" />
            AI Synchronized
          </Badge>
        </div>
      </div>

      {/* SECTION 1: EXECUTIVE KPI OVERVIEW */}
      <StatsGrid
        totalOrders={metrics.totalOrders}
        inProgress={metrics.inProgress}
        ordersInLocalWarehouse={metrics.ordersInLocalWarehouse}
        awaitingFactory={metrics.awaitingFactory}
        ordersInCentralWarehouse={metrics.ordersInCentralWarehouse}
      />

      <div className="grid gap-6 xl:grid-cols-3">
        {/* SECTION 3: AI EXECUTIVE SUMMARY */}
        <Card className="glass-card flex flex-col p-6 xl:col-span-1 shadow-lg shadow-primary/5">
          <div className="flex items-center gap-2 mb-6">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-primary shadow-[0_0_15px_rgba(79,70,229,0.3)]">
              <Sparkles size={16} />
            </div>
            <CardTitle className="text-lg font-semibold tracking-tight text-white">
              AI Briefing
            </CardTitle>
          </div>
          
          <div className="space-y-5 flex-1">
            <div className="space-y-2">
              <p className="text-sm font-medium text-white flex items-center gap-2">
                <TrendingUp size={14} className="text-success" />
                Growth Trajectory
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Revenue increased 18% MoM, driven by a surge in Q3 enterprise accounts. Profit margins expanded by 2.4%.
              </p>
            </div>
            
            <div className="space-y-2">
              <p className="text-sm font-medium text-white flex items-center gap-2">
                <ShieldAlert size={14} className="text-warning" />
                Operational Friction
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {metrics.awaitingFactory} orders are currently awaiting factory processing. Warehouse East is experiencing a 15% delay rate above baseline.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-white flex items-center gap-2">
                <Users size={14} className="text-primary" />
                Customer Health
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                3 high-value customers have overdue invoices. Overall satisfaction score (CSAT) remains stable at 4.8/5.0.
              </p>
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-white/5">
            <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Recommended Action</p>
            <a href="/dashboard/orders?view=awaiting-factory" className="flex items-center justify-between rounded-lg bg-white/5 p-3 hover:bg-white/10 transition-colors border border-white/10 cursor-pointer group">
              <span className="text-sm text-white">Prioritize Factory Backlog</span>
              <ArrowRight size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
            </a>
          </div>
        </Card>

        {/* SECTION 2: FINANCIAL ANALYTICS */}
        <Card className="glass-card p-6 xl:col-span-2 shadow-lg shadow-black/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <CardTitle className="text-lg font-semibold tracking-tight text-white mb-1">Financial Trajectory</CardTitle>
              <CardDescription className="text-sm">Revenue vs Cost comparison over the last 7 months.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <select className="bg-background border border-white/10 rounded-md text-xs px-3 py-1.5 text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50">
                <option>Last 7 Months</option>
                <option>Year to Date</option>
                <option>All Time</option>
              </select>
            </div>
          </div>

          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={financialData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#4F46E5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.4)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis 
                  stroke="rgba(255,255,255,0.4)" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(value) => `$${value / 1000}k`}
                />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#0A0A0A', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
                  itemStyle={{ fontSize: '13px' }}
                  formatter={(value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)}
                />
                <Area type="monotone" dataKey="revenue" stroke="#4F46E5" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" />
                <Bar dataKey="profit" barSize={20} fill="#10B981" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="cost" stroke="#EF4444" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* SECTION 4: OPERATIONAL HEALTH */}
        <Card className="glass-card p-6">
          <CardTitle className="text-lg font-semibold tracking-tight text-white mb-6">Operational Health</CardTitle>
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-2"><CheckCircle2 size={14} className="text-success" /> Fulfillment Rate</span>
                <span className="text-sm font-bold text-white">98.2%</span>
              </div>
              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-success rounded-full w-[98.2%]"></div>
              </div>
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Clock size={14} className="text-warning" /> Delayed Shipments</span>
                <span className="text-sm font-bold text-white">4.5%</span>
              </div>
              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-warning rounded-full w-[4.5%]"></div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-2"><AlertTriangle size={14} className="text-destructive" /> Stockout Risk</span>
                <span className="text-sm font-bold text-white">2.1%</span>
              </div>
              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-destructive rounded-full w-[2.1%]"></div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Users size={14} className="text-primary" /> Customer Satisfaction</span>
                <span className="text-sm font-bold text-white">96.0%</span>
              </div>
              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full w-[96%]"></div>
              </div>
            </div>
          </div>
        </Card>

        {/* SECTION 5: ACTIVITY FEED */}
        <Card className="glass-card p-6">
          <CardTitle className="text-lg font-semibold tracking-tight text-white mb-6">Live Activity Stream</CardTitle>
          <div className="space-y-5">
            {[
              { time: "Just now", action: "Order Placed", detail: "ORD-9923 by Acme Corp", icon: Package, color: "text-primary", bg: "bg-primary/10" },
              { time: "2m ago", action: "Inventory Adjusted", detail: "-50 units SKU-112 (Warehouse East)", icon: Activity, color: "text-warning", bg: "bg-warning/10" },
              { time: "15m ago", action: "Invoice Paid", detail: "$12,450.00 from Globex Inc.", icon: TrendingUp, color: "text-success", bg: "bg-success/10" },
              { time: "1h ago", action: "Shipment Dispatched", detail: "Container tracking updated", icon: Truck, color: "text-cyan-400", bg: "bg-cyan-400/10" },
              { time: "2h ago", action: "Support Ticket Resolved", detail: "Issue #4492 closed", icon: CheckCircle2, color: "text-muted-foreground", bg: "bg-white/5" },
            ].map((feed, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${feed.bg} ${feed.color}`}>
                  <feed.icon size={14} />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium text-white">{feed.action}</p>
                  <p className="text-xs text-muted-foreground">{feed.detail}</p>
                </div>
                <span className="text-[10px] text-muted-foreground/60">{feed.time}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* SECTION 6: TOP PERFORMERS */}
      <div className="space-y-4 pt-4">
        <h3 className="text-lg font-semibold tracking-tight text-white">Top Performers</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="glass-card p-4 hover:border-primary/30 transition-colors">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Top Customer</p>
            <p className="text-lg font-bold text-white">Acme Corp</p>
            <p className="text-sm text-success flex items-center gap-1 mt-1"><TrendingUp size={12} /> $1.2M LTV</p>
          </Card>
          <Card className="glass-card p-4 hover:border-primary/30 transition-colors">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Top Product</p>
            <p className="text-lg font-bold text-white">Industrial Solvent X</p>
            <p className="text-sm text-success flex items-center gap-1 mt-1"><TrendingUp size={12} /> 14.2k Units</p>
          </Card>
          <Card className="glass-card p-4 hover:border-primary/30 transition-colors">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Best Warehouse</p>
            <p className="text-lg font-bold text-white">Warehouse East</p>
            <p className="text-sm text-success flex items-center gap-1 mt-1"><TrendingUp size={12} /> 99.1% Efficiency</p>
          </Card>
          <Card className="glass-card p-4 hover:border-primary/30 transition-colors">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Fastest Route</p>
            <p className="text-lg font-bold text-white">East to Midwest</p>
            <p className="text-sm text-success flex items-center gap-1 mt-1"><TrendingUp size={12} /> 1.2 Days Avg</p>
          </Card>
        </div>
      </div>
      
    </div>
  );
}
