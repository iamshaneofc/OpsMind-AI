import { describe, expect, it } from "vitest";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import {
  appendOrderItemsSectionIfMissing,
  extractOrderItemsFromToolMessages,
  type ChatOrderItemRow,
} from "./chat-order-items-append";

function mkItem(partial: Partial<ChatOrderItemRow>): ChatOrderItemRow {
  return {
    product_name: partial.product_name ?? "Product A",
    sku: partial.sku ?? "PACK-1",
    quantity: partial.quantity ?? 1,
    line_total: partial.line_total ?? 123.45,
    ...partial,
  };
}

describe("appendOrderItemsSectionIfMissing", () => {
  it("does not append when marker already exists", () => {
    const assistant = "Hello\n\n**Items in the Order:**\n1. **X** - SKU: PACK-1 - Quantity: 1 - Line Total: ₹123.45";
    const out = appendOrderItemsSectionIfMissing(assistant, { orderNumber: null, items: [mkItem({ product_name: "Y" })], itemsCount: 1 });
    expect(out).toBe(assistant);
  });

  it("appends canonical markdown table when missing", () => {
    const assistant = "Status here.";
    const items = [mkItem({ product_name: "A", sku: "PACK-1683", quantity: 8, line_total: 10950.4 })];
    const out = appendOrderItemsSectionIfMissing(assistant, { orderNumber: "8.1.2.3", items, itemsCount: 1 });
    expect(out).toContain("**Items in the Order:**");
    expect(out).toMatch(/\| 1 \| A \| PACK-1683 \| 8 \|/);
  });

  it("renders many items as markdown table rows", () => {
    const assistant = "Status here.";
    const items = Array.from({ length: 7 }).map((_, i) => mkItem({ product_name: `P${i + 1}`, sku: `S${i + 1}`, quantity: 1, line_total: 1 }));
    const out = appendOrderItemsSectionIfMissing(assistant, { orderNumber: null, items, itemsCount: 7 });
    expect(out).toContain("| 1 | P1 | S1 |");
    expect(out).toContain("| 7 | P7 | S7 |");
  });
});

describe("extractOrderItemsFromToolMessages", () => {
  it("uses packing_id when sku is N/A", () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: "tool",
        content: JSON.stringify({
          order_number: "8.105.260218.38",
          items: [{ product_name: "Acetic Acid", sku: "N/A", packing_id: 9991, quantity: 32, line_total: 11328 }],
        }),
      },
    ];
    const out = extractOrderItemsFromToolMessages(messages);
    expect(out.items[0]?.sku).toBe("PACK-9991");
  });

  it("extracts items and items_count from tool payload", () => {
    const items = [mkItem({ product_name: "A" }), mkItem({ product_name: "B" })];
    const messages: ChatCompletionMessageParam[] = [
      {
        role: "tool",
        content: JSON.stringify({
          order_number: "8.105.260217.16",
          items,
          items_count: 2,
        }),
      },
    ];
    const out = extractOrderItemsFromToolMessages(messages);
    expect(out.orderNumber).toBe("8.105.260217.16");
    expect(out.items.length).toBe(2);
    expect(out.itemsCount).toBe(2);
  });
});

