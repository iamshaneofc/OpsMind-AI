import { describe, expect, it } from "vitest";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { appendProductCardJsonBlockIfMissing, extractProductCardFromToolMessages } from "./chat-product-card-append";

describe("extractProductCardFromToolMessages", () => {
  it("returns last product_card from tool messages", () => {
    const messages: ChatCompletionMessageParam[] = [
      { role: "tool", tool_call_id: "a", content: JSON.stringify({ product_card: { product: { sku: "A" }, availability: {} } }) },
      { role: "tool", tool_call_id: "b", content: JSON.stringify({ product_card: { product: { sku: "B" }, availability: {} } }) },
    ];
    const pc = extractProductCardFromToolMessages(messages) as { product?: { sku?: string } };
    expect(pc?.product?.sku).toBe("B");
  });

  it("ignores product_candidates responses", () => {
    const messages: ChatCompletionMessageParam[] = [
      { role: "tool", tool_call_id: "a", content: JSON.stringify({ product_candidates: [], message: "pick one" }) },
    ];
    expect(extractProductCardFromToolMessages(messages)).toBeNull();
  });
});

describe("appendProductCardJsonBlockIfMissing", () => {
  const fullCard = {
    product: { sku: "X", product_name: "Test" },
    warehouse: { warehouse_name: "W" },
    availability: { available: true, available_qty: 5, expected_available_by: null },
    order_history: { latest_orders: [] },
  };

  it("appends when assistant JSON has no availability", () => {
    const raw = `Hello\n\n\`\`\`json\n${JSON.stringify({
      product_card: { product: fullCard.product, order_history: { latest_orders: [{ order_number: "1" }] } },
    })}\n\`\`\`\n`;
    const out = appendProductCardJsonBlockIfMissing(raw, fullCard);
    const parsed = JSON.parse(out.match(/```json\n([\s\S]*?)\n```/g)!.pop()!.replace(/^```json\n|\n```$/g, ""));
    expect(parsed.product_card.availability.available_qty).toBe(5);
  });

  it("does not append when assistant already has complete product_card", () => {
    const raw = `\`\`\`json\n${JSON.stringify({ product_card: fullCard })}\n\`\`\`\n`;
    expect(appendProductCardJsonBlockIfMissing(raw, fullCard)).toBe(raw);
  });
});
