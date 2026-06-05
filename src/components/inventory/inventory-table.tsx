import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, AlertTriangle, TrendingDown, DollarSign, Activity } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from "recharts";

interface InventoryRow {
  id: string | number;
  warehouse_id: string | number | null;
  warehouse_name?: string | null;
  product_id: string | number;
  available_qty: number;
  reorder_level: number;
  updated_at: string;
  products: {
    name: string;
    sku: string;
  } | null;
}

interface InventoryTableProps {
  rows: InventoryRow[];
}

export function InventoryTable({ rows }: InventoryTableProps) {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("all");
  const presetLowStock = searchParams?.get("view") === "low-stock";

  const warehouseOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      const id = String(row.warehouse_id ?? "").trim();
      if (!id) continue;
      const name = String(row.warehouse_name ?? "").trim();
      map.set(id, name ? `${name} (${id})` : `Warehouse ${id}`);
    }
    return Array.from(map.entries()).sort((a, b) => Number(a[0]) - Number(b[0]));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const product = Array.isArray(row.products) ? row.products[0] : row.products;
      const low = row.available_qty <= row.reorder_level;
      const warehouseId = String(row.warehouse_id ?? "").trim();
      if ((onlyLowStock || presetLowStock) && !low) return false;
      if (selectedWarehouse !== "all" && warehouseId !== selectedWarehouse) return false;
      if (!q) return true;
      return (
        (product?.name ?? "").toLowerCase().includes(q) ||
        (product?.sku ?? "").toLowerCase().includes(q) ||
        warehouseId.toLowerCase().includes(q)
      );
    });
  }, [rows, query, onlyLowStock, selectedWarehouse, presetLowStock]);

  const totalValue = useMemo(() => {
    return filtered.reduce((acc, row) => acc + (row.available_qty * 45), 0);
  }, [filtered]);

  const lowStockCount = useMemo(() => {
    return rows.filter(r => r.available_qty <= r.reorder_level).length;
  }, [rows]);

  const healthScore = Math.max(0, 100 - (lowStockCount / Math.max(1, rows.length) * 100)).toFixed(1);

  // Mock chart data
  const chartData = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => b.available_qty - a.available_qty).slice(0, 10);
    return sorted.map(s => ({
      name: Array.isArray(s.products) ? s.products[0]?.sku : s.products?.sku || "UNK",
      qty: s.available_qty,
      low: s.available_qty <= s.reorder_level
    }));
  }, [filtered]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Stock Value</h3>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10 border border-success/20">
              <DollarSign size={20} className="text-success" />
            </div>
          </div>
          <p className="text-3xl font-bold text-white mb-2">
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(totalValue)}
          </p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <span className="text-success">↑ 4.2%</span> from last month
          </p>
        </Card>

        <Card className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Reorder Alerts</h3>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 border border-destructive/20">
              <AlertTriangle size={20} className="text-destructive" />
            </div>
          </div>
          <p className="text-3xl font-bold text-white mb-2">{lowStockCount}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <span className="text-destructive">Action required</span> for {lowStockCount} SKUs
          </p>
        </Card>

        <Card className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Health Score</h3>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
              <Activity size={20} className="text-primary" />
            </div>
          </div>
          <p className="text-3xl font-bold text-white mb-2">{healthScore}/100</p>
          <div className="h-2 w-full bg-white/10 rounded-full mt-3 overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${healthScore}%` }}></div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Table */}
        <Card className="glass-card lg:col-span-2 p-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
                Inventory Database
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Showing <span className="font-medium text-foreground">{filtered.length}</span> of {rows.length}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selectedWarehouse}
                onChange={(e) => setSelectedWarehouse(e.target.value)}
                className="h-9 rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white focus:ring-1 focus:ring-primary/50 outline-none"
              >
                <option value="all">All warehouses</option>
                {warehouseOptions.map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search inventory..."
                className="h-9 w-[220px] bg-black/20 border-white/10"
              />
              <Button
                variant={onlyLowStock || presetLowStock ? "default" : "outline"}
                onClick={() => setOnlyLowStock((v) => !v)}
                className={`h-9 ${onlyLowStock || presetLowStock ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : 'bg-white/5 border-white/10'}`}
                disabled={presetLowStock}
              >
                <AlertTriangle size={14} className="mr-2" />
                Alerts
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-white/10 overflow-hidden">
            <Table>
              <TableHeader className="bg-black/40">
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-white">Product</TableHead>
                  <TableHead className="text-white">SKU</TableHead>
                  <TableHead className="text-white">Warehouse</TableHead>
                  <TableHead className="text-right text-white">Stock</TableHead>
                  <TableHead className="text-center text-white">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row, idx) => {
                  const low = row.available_qty <= row.reorder_level;
                  const product = Array.isArray(row.products) ? row.products[0] : row.products;
                  return (
                    <TableRow key={`${row.id}-${idx}`} className="hover:bg-white/5 border-white/10 transition-colors">
                      <TableCell className="font-medium text-white">{product?.name ?? "Unknown Product"}</TableCell>
                      <TableCell className="text-muted-foreground">{product?.sku ?? "-"}</TableCell>
                      <TableCell className="text-muted-foreground">{row.warehouse_name ? `${row.warehouse_name}` : `WH-${row.warehouse_id}`}</TableCell>
                      <TableCell className={`text-right font-medium ${low ? 'text-destructive' : 'text-white'}`}>{row.available_qty}</TableCell>
                      <TableCell className="text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${low ? 'bg-destructive/20 text-destructive border border-destructive/20' : 'bg-success/20 text-success border border-success/20'}`}>
                          {low ? "Low Stock" : "Healthy"}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Chart Side Panel */}
        <Card className="glass-card p-6 flex flex-col">
          <CardTitle className="text-lg font-bold text-white mb-6">Stock Distribution</CardTitle>
          <div className="flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 0, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" stroke="rgba(255,255,255,0.7)" fontSize={11} tickLine={false} axisLine={false} width={80} />
                <RechartsTooltip 
                  cursor={{fill: 'rgba(255,255,255,0.05)'}}
                  contentStyle={{ backgroundColor: '#0A0A0A', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
                />
                <Bar dataKey="qty" radius={[0, 4, 4, 0]} barSize={16}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.low ? '#ef4444' : '#4f46e5'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-6 pt-4 border-t border-white/5">
            <h4 className="text-sm font-medium text-white mb-2">Automated Replenishment</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              AI suggests automatically reordering 3 critical SKUs before the weekend surge. 
            </p>
            <Button className="w-full mt-4 bg-primary hover:bg-primary/90 text-primary-foreground">
              Review Purchase Orders
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
