import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { LineChart, Sparkles, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { requireAuthenticatedUser } from "@/services/auth";
import { InsightsCharts } from "@/components/dashboard/InsightsCharts";
import { prisma } from "@/lib/db";

export default async function InsightsPage() {
  const { profile } = await requireAuthenticatedUser();

  // Compute real insights from database
  let lowStockCount = 0;
  let totalOrders = 0;
  let deliveredOrders = 0;
  let fulfillmentRate = 0;

  try {
    const stockMovements = await prisma.inventoryMovement.groupBy({
      by: ['productId'],
      _sum: { quantity: true },
    });
    lowStockCount = stockMovements.filter(m => (m._sum.quantity || 0) < 30 && (m._sum.quantity || 0) > 0).length;

    totalOrders = await prisma.order.count();
    deliveredOrders = await prisma.order.count({ where: { status: 'DELIVERED' } });
    fulfillmentRate = totalOrders > 0 ? (deliveredOrders / totalOrders) * 100 : 0;
  } catch (error) {
    console.error("Error computing insights:", error);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-1">
        <h1 className="bg-gradient-to-br from-white to-white/50 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
          Insights Hub
        </h1>
        <p className="text-sm text-muted-foreground">
          AI-generated operational intelligence and predictive anomalies.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {/* Insight 1: Fulfillment Rate */}
        <Card className="glass-card flex flex-col p-6 hover:-translate-y-1 hover:border-primary/30">
          <div className="mb-4 flex items-center justify-between">
            <CardTitle className="text-sm font-medium tracking-wide text-white flex items-center gap-2">
              <Sparkles size={16} className="text-primary" />
              Fulfillment Rate
            </CardTitle>
            {fulfillmentRate >= 90 ? (
              <TrendingUp size={18} className="text-success" />
            ) : (
              <TrendingDown size={18} className="text-destructive" />
            )}
          </div>
          <p className="text-2xl font-bold tracking-tight text-white mb-2">{fulfillmentRate.toFixed(1)}%</p>
          <CardDescription className="text-sm leading-relaxed text-muted-foreground">
            {deliveredOrders} of {totalOrders} orders delivered successfully.
          </CardDescription>
        </Card>

        {/* Insight 2: Low Stock */}
        <Card className="glass-card flex flex-col p-6 hover:-translate-y-1 hover:border-destructive/30 border-destructive/10">
          <div className="mb-4 flex items-center justify-between">
            <CardTitle className="text-sm font-medium tracking-wide text-white flex items-center gap-2">
              <AlertTriangle size={16} className="text-destructive" />
              Low Stock Alert
            </CardTitle>
            {lowStockCount > 0 ? (
              <TrendingDown size={18} className="text-destructive" />
            ) : (
              <TrendingUp size={18} className="text-success" />
            )}
          </div>
          <p className="text-2xl font-bold tracking-tight text-white mb-2">{lowStockCount} SKUs</p>
          <CardDescription className="text-sm leading-relaxed text-muted-foreground">
            {lowStockCount > 0 
              ? `Critical low stock detected for ${lowStockCount} item(s). Replenishment recommended.`
              : "All stock levels are healthy."}
          </CardDescription>
        </Card>

        {/* Insight 3: Total Orders */}
        <Card className="glass-card flex flex-col p-6 hover:-translate-y-1 hover:border-primary/30">
          <div className="mb-4 flex items-center justify-between">
            <CardTitle className="text-sm font-medium tracking-wide text-white flex items-center gap-2">
              <LineChart size={16} className="text-primary" />
              Order Volume
            </CardTitle>
            <TrendingUp size={18} className="text-success" />
          </div>
          <p className="text-2xl font-bold tracking-tight text-white mb-2">{totalOrders.toLocaleString()}</p>
          <CardDescription className="text-sm leading-relaxed text-muted-foreground">
            Total orders processed in the system.
          </CardDescription>
        </Card>
      </div>

      <InsightsCharts />

      <div className="glass-card p-8 text-center border-white/5 mt-8">
        <Sparkles size={32} className="mx-auto mb-4 text-primary/50" />
        <h3 className="text-lg font-medium text-white mb-2">More Insights Coming Soon</h3>
        <p className="text-muted-foreground max-w-md mx-auto text-sm">
          OpsMind AI continuously analyzes your data pipeline. More predictive insights will be available as your data grows.
        </p>
      </div>
    </div>
  );
}
