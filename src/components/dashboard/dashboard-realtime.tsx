"use client";

import { useMemo } from "react";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { Card, CardTitle } from "@/components/ui/card";
import type { AppRole } from "@/types/auth";
import { 
  ArrowRight, Sparkles, AlertTriangle, Package, 
  Users, CheckCircle2, MessageSquare 
} from "lucide-react";

interface DashboardRealtimeProps {
  role: AppRole;
  companyId: number | null;
  warehouseId: number | null;
  email?: string;
  initialMetrics: {
    totalOrders: number;
    inProgress: number;
    ordersInLocalWarehouse: number;
    awaitingFactory: number;
    ordersInCentralWarehouse: number;
    revenue: number;
    profit: number;
    inventoryHealth: number;
    fulfillmentRate: number;
    customerGrowth: number;
    ordersByStatus: Array<{ name: string; value: number }>;
    ordersPipeline: Array<{ name: string; value: number }>;
  };
}



export function DashboardRealtime({
  role,
  companyId,
  warehouseId,
  email,
  initialMetrics,
}: DashboardRealtimeProps) {
  const metrics = initialMetrics;
  const firstName = email ? email.split('@')[0].replace(/[^a-zA-Z]/g, ' ').split(' ')[0] : 'Executive';
  const capitalizedName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

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
      {/* SECTION 1: PERSONALIZED EXECUTIVE HEADER */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 pb-4 border-b border-white/5">
        <div className="space-y-3">
          <h1 className="bg-gradient-to-br from-white to-white/70 bg-clip-text text-4xl font-bold tracking-tight text-transparent">
            Good Morning, {capitalizedName}
          </h1>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <button className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 shadow-[0_0_15px_rgba(79,70,229,0.3)]">
            <MessageSquare size={16} />
            Ask Assistant
          </button>
        </div>
      </div>

      {/* SECTION 1: EXECUTIVE KPI OVERVIEW */}
      <StatsGrid
        role={role}
        totalOrders={metrics.totalOrders}
        inProgress={metrics.inProgress}
        ordersInLocalWarehouse={metrics.ordersInLocalWarehouse}
        awaitingFactory={metrics.awaitingFactory}
        ordersInCentralWarehouse={metrics.ordersInCentralWarehouse}
        revenue={metrics.revenue}
        profit={metrics.profit}
        inventoryHealth={metrics.inventoryHealth}
        fulfillmentRate={metrics.fulfillmentRate}
        customerGrowth={metrics.customerGrowth}
      />

      {/* SECTION 4: OPERATIONAL HEALTH */}
      <Card className="glass-card p-6">
        <CardTitle className="text-lg font-semibold tracking-tight text-white mb-6">Operational Health</CardTitle>
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-muted-foreground flex items-center gap-2"><CheckCircle2 size={14} className="text-success" /> Fulfillment Rate</span>
              <span className="text-sm font-bold text-white">{metrics.fulfillmentRate.toFixed(1)}%</span>
            </div>
            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-success rounded-full" style={{ width: `${metrics.fulfillmentRate}%` }}></div>
            </div>
          </div>
          
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-muted-foreground flex items-center gap-2"><AlertTriangle size={14} className="text-warning" /> Awaiting Factory</span>
              <span className="text-sm font-bold text-white">{metrics.awaitingFactory} orders</span>
            </div>
            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-warning rounded-full" style={{ width: `${metrics.totalOrders > 0 ? (metrics.awaitingFactory / metrics.totalOrders) * 100 : 0}%` }}></div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Package size={14} className="text-primary" /> In Progress</span>
              <span className="text-sm font-bold text-white">{metrics.inProgress} orders</span>
            </div>
            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${metrics.totalOrders > 0 ? (metrics.inProgress / metrics.totalOrders) * 100 : 0}%` }}></div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Users size={14} className="text-purple-400" /> Customers</span>
              <span className="text-sm font-bold text-white">{metrics.customerGrowth} total</span>
            </div>
            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-purple-400 rounded-full" style={{ width: '100%' }}></div>
            </div>
          </div>
        </div>
      </Card>
      <Card className="glass-card flex flex-col p-6 shadow-lg shadow-primary/5">
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
              <Package size={14} className="text-primary" />
              Orders Overview
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {metrics.totalOrders} total orders with {metrics.inProgress} currently in progress.
              {metrics.awaitingFactory > 0 && ` ${metrics.awaitingFactory} orders awaiting factory processing.`}
              {metrics.ordersInLocalWarehouse > 0 && ` ${metrics.ordersInLocalWarehouse} orders at local warehouse.`}
            </p>
          </div>
          
          <div className="space-y-2">
            <p className="text-sm font-medium text-white flex items-center gap-2">
              <CheckCircle2 size={14} className="text-success" />
              Fulfillment
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {metrics.fulfillmentRate.toFixed(1)}% fulfillment rate with {metrics.ordersInCentralWarehouse} orders at central warehouse.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-white flex items-center gap-2">
              <Users size={14} className="text-primary" />
              Customer Health
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {metrics.customerGrowth} total customers in the system.
            </p>
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-white/5">
          <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Quick Actions</p>
          <a href="/dashboard/chatbot" className="flex items-center justify-between rounded-lg bg-white/5 p-3 hover:bg-white/10 transition-colors border border-white/10 cursor-pointer group">
            <span className="text-sm text-white">Ask AI Assistant</span>
            <ArrowRight size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
          </a>
        </div>
      </Card>

      {/* SECTION 6: TOP PERFORMERS */}
      <div className="space-y-4 pt-4">
        <h3 className="text-lg font-semibold tracking-tight text-white">Top Performers</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="glass-card p-4 hover:border-primary/30 transition-colors">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Total Orders</p>
            <p className="text-lg font-bold text-white">{metrics.totalOrders.toLocaleString()}</p>
          </Card>
          <Card className="glass-card p-4 hover:border-primary/30 transition-colors">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Revenue</p>
            <p className="text-lg font-bold text-white">${metrics.revenue.toLocaleString()}</p>
          </Card>
          <Card className="glass-card p-4 hover:border-primary/30 transition-colors">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Fulfillment Rate</p>
            <p className="text-lg font-bold text-white">{metrics.fulfillmentRate.toFixed(1)}%</p>
          </Card>
          <Card className="glass-card p-4 hover:border-primary/30 transition-colors">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Customers</p>
            <p className="text-lg font-bold text-white">{metrics.customerGrowth.toLocaleString()}</p>
          </Card>
        </div>
      </div>
      
    </div>
  );
}
