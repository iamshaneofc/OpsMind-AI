import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { displayOrderLineSku } from "@/lib/order-line-display";

export type ChatOrderItemRow = {
  product_name: string;
  sku: string;
  quantity: number;
  line_total: number | null;
};

type ExtractedOrderItems = {
  orderNumber: string | null;
  items: ChatOrderItemRow[];
  itemsCount: number | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizeINR(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  // Keep it consistent with the UI examples (₹ with thousands separators).
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

function sanitizeForMarkdownInline(value: unknown): string {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    // The quick-view parser relies on `**...**` markup, so remove `*` to avoid breaking it.
    .replace(/\*/g, "");
}

export function extractOrderItemsFromToolMessages(messages: ChatCompletionMessageParam[]): ExtractedOrderItems {
  let orderNumber: string | null = null;
  let items: ChatOrderItemRow[] = [];
  let itemsCount: number | null = null;

  for (const m of messages) {
    if (m.role !== "tool") continue;
    const content = typeof m.content === "string" ? m.content : null;
    if (!content?.trim()) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      continue;
    }

    if (!isRecord(parsed)) continue;
    if (parsed.items == null || !Array.isArray(parsed.items) || parsed.items.length === 0) continue;

    const rec = parsed as Record<string, unknown>;
    const on = typeof rec.order_number === "string" ? rec.order_number : null;
    orderNumber = on ?? orderNumber;

    const mapped: ChatOrderItemRow[] = [];
    for (const it of rec.items as unknown[]) {
      if (!isRecord(it)) continue;
      const product_name = typeof it.product_name === "string" ? it.product_name : "";
      const sku = displayOrderLineSku(it);
      const q = typeof it.quantity !== "undefined" ? it.quantity : it.ordered;
      const quantity = typeof q === "number" ? q : Number(q);
      const lineRaw = it.line_total ?? it.item_amount ?? it.invoice_line_item_amount;
      const line_total =
        typeof lineRaw === "number"
          ? lineRaw
          : lineRaw == null || lineRaw === ""
            ? null
            : Number(lineRaw);
      if (!product_name.trim()) continue;
      mapped.push({
        product_name,
        sku,
        quantity: Number.isFinite(quantity) ? quantity : 0,
        line_total: line_total == null || !Number.isFinite(line_total) ? null : line_total,
      });
    }

    if (mapped.length) {
      items = mapped;
      const countCandidate =
        typeof rec.items_count === "number"
          ? rec.items_count
          : isRecord(rec.summary) && typeof rec.summary.total_items === "number"
            ? rec.summary.total_items
            : null;
      itemsCount = countCandidate ?? mapped.length;
    }
  }

  return { orderNumber, items, itemsCount };
}

/**
 * Ensure we always include a standardized markdown block the UI can parse:
 *   **Items in the Order:**
 *   1. **Product** - SKU: ... - Quantity: ... - Line Total: ...
 */
export function appendOrderItemsSectionIfMissing(assistantText: string, toolItems: ExtractedOrderItems): string {
  if (!toolItems.items.length) return assistantText;

  // If the assistant already included our canonical section, do not duplicate.
  if (/\*\*Items in the Order:\*\*/i.test(assistantText)) return assistantText;

  const itemsToShow = toolItems.items;

  let table = `| # | Product | SKU | Quantity | Line Total |\n`;
  table += `|---|---|---|---|---|\n`;
  table += itemsToShow.map((it, idx) => {
    const product = sanitizeForMarkdownInline(it.product_name);
    const sku = sanitizeForMarkdownInline(it.sku);
    const qty = String(it.quantity);
    const lineTotal = normalizeINR(it.line_total);
    return `| ${idx + 1} | ${product} | ${sku} | ${qty} | ${lineTotal} |`;
  }).join("\n");

  const showMoreLine =
    itemsToShow.length < toolItems.items.length ? `\n\nShowing first ${itemsToShow.length} of ${toolItems.items.length} total items.` : "";

  const section =
    `\n\n**Items in the Order:**\n\n` +
    table +
    showMoreLine;

  return assistantText + section;
}

