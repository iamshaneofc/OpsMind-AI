import { describe, expect, it } from "vitest";
import { parseAssistantJsonBlocks } from "./parse-assistant-json";
import type { LaneAOrderSnapshot } from "@/types/lane-a";

function minimalLaneA(overrides: Partial<LaneAOrderSnapshot> = {}): LaneAOrderSnapshot {
  return {
    external_status: "DELIVERED",
    explanation: "Test order completed.",
    expected_delivery_band: {
      label: "Not applicable — order is already completed in ERP (no forward estimated delivery).",
      center_date: null,
      window_start: null,
      window_end: null,
      is_indicative: true,
    },
    next_update_by: null,
    next_action: "wait",
    next_action_reason: "No follow-up needed.",
    ...overrides,
  };
}

describe("parseAssistantJsonBlocks", () => {
  it("extracts lane_a and strips valid json block from prose", () => {
    const lane = minimalLaneA();
    const raw = `Here is the summary.\n\`\`\`json\n${JSON.stringify({ order_number: "11.105.260217.24", lane_a: lane })}\n\`\`\`\n`;
    const out = parseAssistantJsonBlocks(raw);
    expect(out.laneA?.external_status).toBe("DELIVERED");
    expect(out.orderNumberFromJson).toBe("11.105.260217.24");
    expect(out.text).not.toContain("```json");
    expect(out.text.trim()).toBe("Here is the summary.");
  });

  it("leaves invalid json blocks in prose", () => {
    const raw = `Text before\n\`\`\`json\n{ not valid json }\n\`\`\`\nAfter`;
    const out = parseAssistantJsonBlocks(raw);
    expect(out.laneA).toBeNull();
    expect(out.text).toContain("not valid json");
  });

  it("parses lane_a with next_update_by set", () => {
    const lane = minimalLaneA({
      external_status: "IN_PREPARATION",
      next_update_by: "2026-03-25",
      expected_delivery_band: {
        label: "Mar 1, 2026 – Mar 5, 2026 (indicative)",
        center_date: "2026-03-03",
        window_start: "2026-03-01",
        window_end: "2026-03-05",
        is_indicative: true,
      },
    });
    const raw = `OK\n\`\`\`json\n${JSON.stringify({ order_number: "1.2.3.4", lane_a: lane })}\n\`\`\``;
    const out = parseAssistantJsonBlocks(raw);
    expect(out.laneA?.next_update_by).toBe("2026-03-25");
  });
});
