/**
 * Consistent SKU / catalogue display for order line payloads (ERP tools, chat append, deterministic tables).
 */
export function displayOrderLineSku(row: Record<string, unknown>): string {
  const trySku = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    if (!t) return null;
    if (/^n\/?a$/i.test(t)) return null;
    return t;
  };

  const fromSku = trySku(row.sku) ?? trySku(row.product_sku);
  if (fromSku) return fromSku;

  const rawCat = row.catalogue_no ?? row.Catalogue_No;
  if (rawCat != null && String(rawCat).trim()) return String(rawCat).trim();

  const rawPack = row.packing_id ?? row.Packing_ID;
  const p = rawPack != null && rawPack !== "" ? Number(rawPack) : NaN;
  if (Number.isFinite(p) && p > 0) return `PACK-${p}`;

  return "—";
}
