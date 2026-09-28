"use client";

import { Card, CardTitle } from "@/components/ui/card";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export type PerformancePoint = { name: string; revenue: number };
export type InventoryPoint = { category: string; stock: number };

type Props = {
  performanceData?: PerformancePoint[];
  inventoryData?: InventoryPoint[];
  revenueSubtitle?: string;
  inventorySubtitle?: string;
};

export function InsightsCharts({
  performanceData = [],
  inventoryData = [],
  revenueSubtitle,
  inventorySubtitle,
}: Props) {
  const emptyRevenue = performanceData.length === 0;
  const emptyInventory = inventoryData.length === 0;
  return (
    <div className="grid gap-6 md:grid-cols-2 mt-8">
      <Card className="glass-card p-6 h-[350px] flex flex-col hover:border-primary/30">
        <CardTitle className="text-sm font-medium text-white mb-1">Revenue Trend</CardTitle>
        <p className="mb-5 text-xs text-muted-foreground">{revenueSubtitle ?? "No data in scope."}</p>
        <div className="flex-1 w-full h-full min-h-0">
          {emptyRevenue ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No orders in scope yet.
            </div>
          ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={performanceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="name" stroke="rgba(255,255,255,0.5)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
                itemStyle={{ color: '#fff' }}
              />
              <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
          )}
        </div>
      </Card>

      <Card className="glass-card p-6 h-[350px] flex flex-col hover:border-primary/30">
        <CardTitle className="text-sm font-medium text-white mb-1">Stock by Warehouse</CardTitle>
        <p className="mb-5 text-xs text-muted-foreground">{inventorySubtitle ?? "No data in scope."}</p>
        <div className="flex-1 w-full h-full min-h-0">
          {emptyInventory ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No inventory in scope yet.
            </div>
          ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={inventoryData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" horizontal={false} />
              <XAxis type="number" stroke="rgba(255,255,255,0.5)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis dataKey="category" type="category" stroke="rgba(255,255,255,0.5)" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip 
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
                itemStyle={{ color: '#fff' }}
              />
              <Bar dataKey="stock" fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          )}
        </div>
      </Card>
    </div>
  );
}
