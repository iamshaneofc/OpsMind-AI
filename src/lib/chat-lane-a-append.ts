import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { LaneAOrderSnapshot } from "@/types/lane-a";
import { parseAssistantJsonBlocks } from "@/components/chatbot/parse-assistant-json";

/**
 * Last matching tool payload wins (e.g. multiple tool rounds).
 */
export function extractLaneAFromToolMessages(messages: ChatCompletionMessageParam[]): {
  orderNumber: string | null;
  laneA: LaneAOrderSnapshot | null;
} {
  let orderNumber: string | null = null;
  let laneA: LaneAOrderSnapshot | null = null;

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
    if (rec.lane_a == null || typeof rec.lane_a !== "object") continue;
    const on = rec.order_number;
    if (typeof on !== "string" || !on.trim()) continue;
    orderNumber = on.trim();
    laneA = rec.lane_a as LaneAOrderSnapshot;
  }

  return { orderNumber, laneA };
}

/**
 * If the model omitted the Lane A fenced-json block, append it so the chat UI can render the order truth card.
 */
export function appendLaneAJsonBlockIfMissing(
  assistantText: string,
  toolOrderNumber: string | null,
  toolLaneA: LaneAOrderSnapshot | null,
): string {
  if (!toolLaneA || !toolOrderNumber?.trim()) return assistantText;
  const parsed = parseAssistantJsonBlocks(assistantText);
  if (parsed.laneA) return assistantText;
  const block = `\n\n\`\`\`json\n${JSON.stringify({ order_number: toolOrderNumber.trim(), lane_a: toolLaneA })}\n\`\`\`\n`;
  return assistantText + block;
}
