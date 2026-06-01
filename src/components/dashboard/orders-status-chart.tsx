"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

const COLORS = ["#22d3ee", "#60a5fa", "#818cf8", "#34d399", "#f59e0b", "#f43f5e"];

interface OrdersStatusChartProps {
  data: Array<{ name: string; value: number }>;
}

export function OrdersStatusChart({ data }: OrdersStatusChartProps) {
  return (
    <Card className="h-[360px]">
      <CardTitle>Orders Distribution</CardTitle>
      <CardDescription className="mb-5">Status spread across your current scope</CardDescription>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={65} outerRadius={100}>
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  );
}
