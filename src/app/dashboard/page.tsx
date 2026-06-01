import { DashboardRealtime } from "@/components/dashboard/dashboard-realtime";
import { requireAuthenticatedUser } from "@/services/auth";
import { getDashboardMetrics } from "@/services/operations";

export default async function DashboardPage() {
  const { profile } = await requireAuthenticatedUser();
  let metrics = {
    totalOrders: 0,
    inProgress: 0,
    ordersInLocalWarehouse: 0,
    awaitingFactory: 0,
    ordersInCentralWarehouse: 0,
    ordersByStatus: [] as Array<{ name: string; value: number }>,
    ordersPipeline: [] as Array<{ name: string; value: number }>,
  };
  try {
    metrics = await getDashboardMetrics(profile);
  } catch (error) {
    // Keep dashboard rendering even when ERP backend is temporarily unavailable.
    console.warn("DashboardPage: failed to load ERP metrics", error);
  }

  return (
    <DashboardRealtime
      role={profile.role}
      companyId={profile.company_id}
      warehouseId={profile.warehouse_id}
      initialMetrics={metrics}
    />
  );
}
