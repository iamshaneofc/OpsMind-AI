import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

/**
 * Last matching tool payload wins (e.g. multiple tool rounds).
 * Skips product_candidate flows and error responses.
 */
export function extractProductCardFromToolMessages(messages: ChatCompletionMessageParam[]): unknown | null {
  let last: unknown | null = null;
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
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    const rec = parsed as Record<string, unknown>;
    if (rec.error != null) continue;
    if (rec.product_candidates != null) continue;
    if (rec.product_card != null) last = rec.product_card;
  }
  return last;
}

/**
 * Append the authoritative ERP `product_card` from tool results so StructuredDataRenderer runs
 * (Latest Orders + availability). The model often prints only markdown tables; it may also emit
 * its own `product_card` JSON that is incomplete or order-agnostic — we still merge the tool payload
 * unless the exact same JSON is already present.
 */
export function appendProductCardJsonBlockIfMissing(assistantText: string, toolProductCard: unknown | null): string {
  if (toolProductCard == null || typeof toolProductCard !== "object") return assistantText;
  const payload = JSON.stringify({ product_card: toolProductCard });
  if (assistantText.includes(payload)) return assistantText;
  const block = `\n\n\`\`\`json\n${payload}\n\`\`\`\n`;
  return assistantText + block;
}
