"use client";

import { useCallback, useEffect, useState } from "react";
import { OrdersTable } from "@/components/orders/orders-table";
import type { AppRole } from "@/types/auth";

interface OrderRow {
  id: string | number;
  order_number: string;
  status: string;
  customer_name: string | null;
  expected_delivery_date: string | null;
  created_at: string;
}

interface OrdersRealtimeTableProps {
  role: AppRole;
  companyId: number | null;
  warehouseId: number | null;
  initialRows: OrderRow[];
}

export function OrdersRealtimeTable({
  role,
  companyId,
  warehouseId,
  initialRows,
}: OrdersRealtimeTableProps) {
  const [rows, setRows] = useState(initialRows);

  const refreshOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/orders", { method: "GET" });
      if (!res.ok) return;
      const next = (await res.json()) as OrderRow[];
      setRows(next);
    } catch {
      // ignore transient network errors
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      refreshOrders();
    }, 15000);
    return () => clearInterval(id);
  }, [refreshOrders]);

  return <OrdersTable rows={rows} role={role} />;
}
