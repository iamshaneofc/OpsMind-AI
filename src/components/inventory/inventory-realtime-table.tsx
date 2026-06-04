"use client";

import { useCallback, useEffect, useState } from "react";
import { InventoryTable } from "@/components/inventory/inventory-table";
import type { AppRole } from "@/types/auth";

interface InventoryRow {
  id: string | number;
  warehouse_id: string | number | null;
  warehouse_name?: string | null;
  product_id: string | number;
  available_qty: number;
  reorder_level: number;
  updated_at: string;
  products: { name: string; sku: string } | null;
}

interface InventoryRealtimeTableProps {
  role: AppRole;
  warehouseId: number | null;
  initialRows: InventoryRow[];
}

export function InventoryRealtimeTable({
  role,
  warehouseId,
  initialRows,
}: InventoryRealtimeTableProps) {
  const [rows, setRows] = useState(initialRows);

  const refreshInventory = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/inventory", { method: "GET" });
      if (!res.ok) return;
      const next = (await res.json()) as InventoryRow[];
      setRows(next);
    } catch {
      // ignore transient network errors
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      refreshInventory();
    }, 20000);
    return () => clearInterval(id);
  }, [refreshInventory]);

  return <InventoryTable rows={rows} />;
}
