/**
 * Gap H: ERP central hub depot (defaults to BhiwandiDepot Location_id = 6).
 */
const DEFAULT_ERP_CENTRAL_WAREHOUSE_LOCATION_ID = 6;

/** Primary central warehouse ERP `dbo.Location.Location_id` (hub). */
export function resolveCentralWarehouseLocationId(): number {
  const n = Number(process.env.ERP_CENTRAL_WAREHOUSE_LOCATION_ID);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : DEFAULT_ERP_CENTRAL_WAREHOUSE_LOCATION_ID;
}
