import { DashboardRealtime } from "@/components/dashboard/dashboard-realtime";
import { INDUSTRIES } from "@/lib/industry";
import { getActiveIndustry } from "@/lib/industry-server";
import { requireAuthenticatedUser } from "@/services/auth";
import { getDashboardMetrics } from "@/services/operations";

export default async function DashboardPage() {
  const { profile } = await requireAuthenticatedUser();
  const industry = getActiveIndustry();
  const meta = INDUSTRIES[industry];

  let metrics = {
    totalOrders: 0,
    inProgress: 0,
    ordersInLocalWarehouse: 0,
    awaitingFactory: 0,
    ordersInCentralWarehouse: 0,
    revenue: 0,
    profit: 0,
    inventoryHealth: 0,
    fulfillmentRate: 0,
    customerGrowth: 0,
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
      email={profile.email}
      companyName={meta.companyName}
      industryLabel={meta.label}
      initialMetrics={metrics}
    />
  );
}
