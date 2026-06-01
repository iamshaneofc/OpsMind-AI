import { describe, expect, it } from "vitest";
import {
  computeFollowUpSuggestions,
  getComposerSuggestionChips,
  getRoleStarters,
} from "./chat-follow-up-suggestions";

describe("computeFollowUpSuggestions", () => {
  it("does not suggest expected delivery when assistant shows Delivered (case)", () => {
    const assistant = `
Order 11.105.260217.24
- Order Status: Delivered
- Indicative estimated delivery: Not applicable — order is already completed in ERP (no forward estimated delivery).
`;
    const chips = computeFollowUpSuggestions("What is the status?", assistant, "super_admin");
    const deliveryChip = chips.find((c) => /expected delivery date for order/i.test(c));
    expect(deliveryChip).toBeUndefined();
  });

  it("does not suggest expected delivery when external_status DELIVERED appears in json", () => {
    const assistant = 'Summary\n```json\n{"order_number":"1.2.3.4","lane_a":{"external_status":"DELIVERED"}}\n```';
    const chips = computeFollowUpSuggestions("track order", assistant, "distributor");
    expect(chips.some((c) => /expected delivery date for order/i.test(c))).toBe(false);
  });

  it("suggests Track another order when delivered (needs ERP order no. in text)", () => {
    const assistant =
      "Order 11.105.260217.24 — Status Delivered. no forward estimated delivery. Order shows completed in ERP.";
    const chips = computeFollowUpSuggestions("status?", assistant, "super_admin");
    expect(chips.some((c) => c.includes("Track another order"))).toBe(true);
  });

  it("skips expected delivery chip when user already asked for estimated delivery", () => {
    const assistant = "Order 6.1.2.3 — still processing.";
    const chips = computeFollowUpSuggestions(
      "What is the expected delivery date for order 6.1.2.3?",
      assistant,
      "super_admin",
    );
    expect(chips.some((c) => /expected delivery date for order/i.test(c))).toBe(false);
  });

  it("does not repeat pending orders when recent thread already asked", () => {
    const assistant = "Here are your recent orders (summary).";
    const chips = computeFollowUpSuggestions("Thanks", assistant, "distributor", {
      recentUserTexts: ["Hello", "Show my pending orders"],
    });
    expect(chips.some((c) => /pending orders/i.test(c))).toBe(false);
  });

  it("getComposerSuggestionChips uses latest turn for distributor", () => {
    const assistant = "Order 9.105.1.2 — Status IN_PREPARATION.";
    const messages = [
      { role: "user", content: "Status for 9.105.1.2?" },
      { role: "assistant", content: assistant },
    ];
    const chips = getComposerSuggestionChips(messages, "distributor", false);
    expect(chips.some((c) => c.includes("9.105.1.2"))).toBe(true);
    expect(chips.length).toBeGreaterThan(0);
  });

  it("getComposerSuggestionChips falls back to role starters when no assistant reply yet", () => {
    const messages = [{ role: "user", content: "Hi" }];
    expect(getComposerSuggestionChips(messages, "distributor", false)).toEqual(getRoleStarters("distributor"));
  });
});
