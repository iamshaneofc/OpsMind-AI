import { getIndustryMeta, type IndustryId } from "@/lib/industry";

function daysBetween(a: Date | null | undefined, b: Date = new Date()): number | null {
  if (!a) return null;
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function money(amount: number | null | undefined, industry: IndustryId): string {
  const meta = getIndustryMeta(industry);
  const n = Number(amount) || 0;
  return new Intl.NumberFormat(meta.locale, {
    style: "currency",
    currency: meta.currency,
    maximumFractionDigits: 0,
  }).format(n);
}

function dateLabel(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** Flatten Prisma order rows into LLM-friendly display records. */
export function formatOrdersForBot(orders: any[], industry: IndustryId) {
  const meta = getIndustryMeta(industry);
  return orders.map((o) => {
    const expected = o.expectedDelivery ? new Date(o.expectedDelivery) : null;
    const lateDays =
      expected && o.status !== "DELIVERED" && o.status !== "CANCELLED"
        ? Math.max(0, daysBetween(expected) ?? 0)
        : null;
    return {
      orderNumber: o.orderNumber,
      status: o.status,
      customer: o.customer?.name ?? "Unknown",
      customerLocation: o.customer?.location ?? null,
      warehouse: o.warehouse?.name ?? null,
      amount: o.totalAmount,
      amountFormatted: money(o.totalAmount, industry),
      orderDate: dateLabel(o.orderDate ?? o.createdAt),
      expectedDelivery: dateLabel(expected),
      daysLate: lateDays && lateDays > 0 ? lateDays : null,
      currency: meta.currencySymbol,
      unitHint: meta.unit,
    };
  });
}

export function formatOrderDetailsForBot(order: any, industry: IndustryId) {
  if (!order) return null;
  const meta = getIndustryMeta(industry);
  const base = formatOrdersForBot([order], industry)[0];
  return {
    ...base,
    items: (order.items || []).map((it: any) => ({
      sku: it.product?.sku ?? null,
      product: it.product?.name ?? "Unknown",
      quantity: it.quantity,
      unitPriceFormatted: money(it.unitPrice, industry),
      lineTotalFormatted: money(it.totalPrice, industry),
      unit: meta.unit,
    })),
    invoices: (order.invoices || []).map((inv: any) => ({
      invoiceNumber: inv.invoiceNumber,
      status: inv.status,
      amountFormatted: money(inv.amount, industry),
      dueDate: dateLabel(inv.dueDate),
    })),
  };
}

export function formatInvoicesForBot(invoices: any[], industry: IndustryId) {
  return invoices.map((inv) => ({
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    amount: inv.amount,
    amountFormatted: money(inv.amount, industry),
    dueDate: dateLabel(inv.dueDate),
    daysOverdue: inv.status === "OVERDUE" ? Math.max(0, daysBetween(inv.dueDate) ?? 0) : null,
    customer: inv.order?.customer?.name ?? null,
    orderNumber: inv.order?.orderNumber ?? null,
  }));
}

export function formatLowStockForBot(
  rows: Array<{ product: any; warehouse: any; quantity: number | null }>,
  industry: IndustryId,
) {
  const meta = getIndustryMeta(industry);
  return rows.map((r) => ({
    sku: r.product?.sku ?? null,
    product: r.product?.name ?? "Unknown",
    warehouse: r.warehouse?.name ?? null,
    onHand: r.quantity ?? 0,
    unit: meta.unit,
    category: r.product?.category ?? null,
  }));
}

export function formatTopCustomersForBot(
  rows: Array<{ customer: any; totalSpent: number | null; orderCount?: number }>,
  industry: IndustryId,
) {
  return rows.map((r) => ({
    customer: r.customer?.name ?? "Unknown",
    location: r.customer?.location ?? null,
    totalSpentFormatted: money(r.totalSpent, industry),
    totalSpent: r.totalSpent,
    orderCount: r.orderCount ?? null,
  }));
}

export function formatTopProductsForBot(
  rows: Array<{ product: any; sold: number | null; revenue: number | null }>,
  industry: IndustryId,
) {
  const meta = getIndustryMeta(industry);
  return rows.map((r) => ({
    sku: r.product?.sku ?? null,
    product: r.product?.name ?? "Unknown",
    sold: r.sold,
    unit: meta.unit,
    revenueFormatted: money(r.revenue, industry),
  }));
}
