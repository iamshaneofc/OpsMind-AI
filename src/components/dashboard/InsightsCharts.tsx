"use client";

import { Card, CardTitle } from "@/components/ui/card";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const performanceData = [
  { name: 'Jan', revenue: 4000, orders: 240 },
  { name: 'Feb', revenue: 3000, orders: 139 },
  { name: 'Mar', revenue: 2000, orders: 980 },
  { name: 'Apr', revenue: 2780, orders: 390 },
  { name: 'May', revenue: 1890, orders: 480 },
  { name: 'Jun', revenue: 2390, orders: 380 },
  { name: 'Jul', revenue: 3490, orders: 430 },
];

const inventoryData = [
  { category: 'Raw Mat', stock: 400 },
  { category: 'Pkg', stock: 300 },
  { category: 'Finished', stock: 300 },
  { category: 'Spares', stock: 200 },
];

export function InsightsCharts() {
  return (
    <div className="grid gap-6 md:grid-cols-2 mt-8">
      <Card className="glass-card p-6 h-[350px] flex flex-col hover:border-primary/30">
        <CardTitle className="text-sm font-medium text-white mb-6">Revenue & Order Trend (H1 2026)</CardTitle>
        <div className="flex-1 w-full h-full min-h-0">
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
        </div>
      </Card>

      <Card className="glass-card p-6 h-[350px] flex flex-col hover:border-primary/30">
        <CardTitle className="text-sm font-medium text-white mb-6">Inventory Distribution by Category</CardTitle>
        <div className="flex-1 w-full h-full min-h-0">
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
        </div>
      </Card>
    </div>
  );
}
