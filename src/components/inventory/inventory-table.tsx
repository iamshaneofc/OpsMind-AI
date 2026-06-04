import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>Inventory Visibility</CardTitle>
          {presetLowStock ? <p className="mt-1 text-xs text-cyan-300">Preset: Low-stock items</p> : null}
          <p className="mt-1 text-sm text-muted-foreground">
            Showing <span className="font-medium text-foreground">{filtered.length}</span> of{" "}
            <span className="font-medium text-foreground">{rows.length}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedWarehouse}
            onChange={(e) => setSelectedWarehouse(e.target.value)}
            className="h-9 rounded-md border border-border/70 bg-slate-950/60 px-2 text-sm"
            aria-label="Filter by warehouse"
          >
            <option value="all">All warehouses</option>
            {warehouseOptions.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search product / SKU / warehouse…"
            className="h-9 w-[280px]"
          />
          <Button
            type="button"
            size="sm"
            variant={onlyLowStock || presetLowStock ? "default" : "outline"}
            onClick={() => setOnlyLowStock((v) => !v)}
            className="h-9"
            disabled={presetLowStock}
          >
            {presetLowStock ? "Low stock only" : onlyLowStock ? "Low stock only" : "All stock"}
          </Button>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead>Warehouse</TableHead>
            <TableHead>Available</TableHead>
            <TableHead>Alert</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((row, idx) => {
            const low = row.available_qty <= row.reorder_level;
            const product = Array.isArray(row.products) ? row.products[0] : row.products;
            return (
              <TableRow key={`${row.id}-${idx}`}>
                <TableCell className="font-medium">{product?.name ?? "Unknown Product"}</TableCell>
                <TableCell>{product?.sku ?? "-"}</TableCell>
                <TableCell>{row.warehouse_name ? `${row.warehouse_name} (${row.warehouse_id})` : row.warehouse_id}</TableCell>
                <TableCell>{row.available_qty}</TableCell>
                <TableCell>
                  <Badge variant={low ? "danger" : "success"}>
                    {low ? "Low Stock" : "Healthy"}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
