import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { LineChart, Sparkles, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { requireAuthenticatedUser } from "@/services/auth";

export default async function InsightsPage() {
  await requireAuthenticatedUser();

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
        {/* Insight 1 */}
        <Card className="glass-card flex flex-col p-6 hover:-translate-y-1 hover:border-primary/30">
          <div className="mb-4 flex items-center justify-between">
            <CardTitle className="text-sm font-medium tracking-wide text-white flex items-center gap-2">
              <Sparkles size={16} className="text-primary" />
              Revenue Forecast
            </CardTitle>
            <TrendingUp size={18} className="text-success" />
          </div>
          <p className="text-2xl font-bold tracking-tight text-white mb-2">+14.2%</p>
          <CardDescription className="text-sm leading-relaxed text-muted-foreground">
            Projected increase in Q3 revenue based on current order volume and historical seasonal trends.
          </CardDescription>
        </Card>

        {/* Insight 2 */}
        <Card className="glass-card flex flex-col p-6 hover:-translate-y-1 hover:border-destructive/30 border-destructive/10">
          <div className="mb-4 flex items-center justify-between">
            <CardTitle className="text-sm font-medium tracking-wide text-white flex items-center gap-2">
              <AlertTriangle size={16} className="text-destructive" />
              Inventory Risk
            </CardTitle>
            <TrendingDown size={18} className="text-destructive" />
          </div>
          <p className="text-2xl font-bold tracking-tight text-white mb-2">3 SKUs</p>
          <CardDescription className="text-sm leading-relaxed text-muted-foreground">
            Critical low stock detected for top-selling items. Replenishment recommended within 48 hours to avoid stockouts.
          </CardDescription>
        </Card>

        {/* Insight 3 */}
        <Card className="glass-card flex flex-col p-6 hover:-translate-y-1 hover:border-primary/30">
          <div className="mb-4 flex items-center justify-between">
            <CardTitle className="text-sm font-medium tracking-wide text-white flex items-center gap-2">
              <LineChart size={16} className="text-primary" />
              Fulfillment Efficiency
            </CardTitle>
            <TrendingUp size={18} className="text-success" />
          </div>
          <p className="text-2xl font-bold tracking-tight text-white mb-2">98.4%</p>
          <CardDescription className="text-sm leading-relaxed text-muted-foreground">
            On-time delivery rate is up 2.1% this month. The new routing algorithm is performing optimally.
          </CardDescription>
        </Card>
      </div>

      <div className="glass-card p-8 text-center border-white/5 mt-8">
        <Sparkles size={32} className="mx-auto mb-4 text-primary/50" />
        <h3 className="text-lg font-medium text-white mb-2">More Insights Generating</h3>
        <p className="text-muted-foreground max-w-md mx-auto text-sm">
          OpsMind AI continuously analyzes your data pipeline. Check back later for new predictive insights.
        </p>
      </div>
    </div>
  );
}
