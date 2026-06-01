import { OrdersRealtimeTable } from "@/components/orders/orders-realtime-table";
import { requireAuthenticatedUser } from "@/services/auth";
import { getOrdersForRole } from "@/services/operations";

export default async function OrdersPage() {
  const { profile } = await requireAuthenticatedUser();
  const orders = await getOrdersForRole(profile);

  return (
    <OrdersRealtimeTable
      role={profile.role}
      companyId={profile.company_id}
      warehouseId={profile.warehouse_id}
      initialRows={orders}
    />
  );
}
