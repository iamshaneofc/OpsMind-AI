import { describe, expect, it } from "vitest";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { appendLaneAJsonBlockIfMissing, extractLaneAFromToolMessages } from "./chat-lane-a-append";
import type { LaneAOrderSnapshot } from "@/types/lane-a";

function minimalLaneA(): LaneAOrderSnapshot {
  return {
    external_status: "PENDING",
    explanation: "Pending.",
    expected_delivery_band: {
      label: "Not enough data for an estimated delivery window (indicative)",
      center_date: null,
      window_start: null,
      window_end: null,
      is_indicative: true,
    },
    next_update_by: "2026-04-01",
    next_action: "wait",
    next_action_reason: "Wait.",
  };
}

describe("extractLaneAFromToolMessages", () => {
  it("returns last tool result with order_number and lane_a", () => {
    const lane = minimalLaneA();
    const messages: ChatCompletionMessageParam[] = [
      {
        role: "tool",
        content: JSON.stringify({
          order_number: "8.1.2.3",
          lane_a: lane,
        }),
      },
    ];
    const out = extractLaneAFromToolMessages(messages);
    expect(out.orderNumber).toBe("8.1.2.3");
    expect(out.laneA?.external_status).toBe("PENDING");
  });

  it("skips tool payloads with error", () => {
    const messages: ChatCompletionMessageParam[] = [
      { role: "tool", content: JSON.stringify({ error: "not found" }) },
    ];
    const out = extractLaneAFromToolMessages(messages);
    expect(out.orderNumber).toBeNull();
    expect(out.laneA).toBeNull();
  });

  it("last matching tool wins", () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: "tool",
        content: JSON.stringify({
          order_number: "A",
          lane_a: { ...minimalLaneA(), explanation: "first" },
        }),
      },
      {
        role: "tool",
        content: JSON.stringify({
          order_number: "B",
          lane_a: { ...minimalLaneA(), explanation: "second" },
        }),
      },
    ];
    const out = extractLaneAFromToolMessages(messages);
    expect(out.orderNumber).toBe("B");
    expect(out.laneA?.explanation).toBe("second");
  });
});

describe("appendLaneAJsonBlockIfMissing", () => {
  it("appends json block when lane_a missing from assistant text", () => {
    const lane = minimalLaneA();
    const before = "Short prose only.";
    const after = appendLaneAJsonBlockIfMissing(before, "1.2.3.4", lane);
    expect(after).toContain("```json");
    expect(after).toContain('"lane_a"');
    expect(after.length).toBeGreaterThan(before.length);
  });

  it("does not duplicate when parsed text already has lane_a json", () => {
    const lane = minimalLaneA();
    const block = `\`\`\`json\n${JSON.stringify({ order_number: "1.2.3.4", lane_a: lane })}\n\`\`\``;
    const already = `Prose\n${block}`;
    const out = appendLaneAJsonBlockIfMissing(already, "1.2.3.4", lane);
    expect(out).toBe(already);
  });
});
