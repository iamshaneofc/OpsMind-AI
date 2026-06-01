import { InventoryRealtimeTable } from "@/components/inventory/inventory-realtime-table";
import { requireAuthenticatedUser } from "@/services/auth";
import { getInventoryForRole } from "@/services/operations";

export default async function InventoryPage() {
  const { profile } = await requireAuthenticatedUser();

  const inventory = await getInventoryForRole(profile);
  return (
    <InventoryRealtimeTable
      role={profile.role}
      warehouseId={profile.warehouse_id}
      initialRows={inventory}
    />
  );
}
