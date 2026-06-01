"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

const COLORS = ["#22d3ee", "#60a5fa", "#818cf8", "#34d399", "#f59e0b", "#94a3b8"];

interface OrdersPipelineChartProps {
  data: Array<{ name: string; value: number }>;
}

export function OrdersPipelineChart({ data }: OrdersPipelineChartProps) {
  const chartData = data.length ? data : [{ name: "No Data", value: 1 }];

  return (
    <Card className="h-[360px]">
      <CardTitle>Fulfillment pipeline</CardTitle>
      <CardDescription className="mb-3">Grouped stages for orders in your current list</CardDescription>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart layout="vertical" data={chartData} margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
          <XAxis type="number" hide={chartData.length === 1 && chartData[0].name === "No Data"} />
          <YAxis
            type="category"
            dataKey="name"
            width={118}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            interval={0}
          />
          <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
