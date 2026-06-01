import { describe, expect, it } from "vitest";
import { displayOrderLineSku } from "./order-line-display";

describe("displayOrderLineSku", () => {
  it("uses catalogue when sku is N/A", () => {
    expect(displayOrderLineSku({ sku: "N/A", catalogue_no: "A-00101" })).toBe("A-00101");
  });

  it("falls back to PACK-n from packing_id when sku is missing", () => {
    expect(displayOrderLineSku({ packing_id: 1683 })).toBe("PACK-1683");
  });

  it("ignores case-insensitive na sku and uses packing_id", () => {
    expect(displayOrderLineSku({ sku: "n/a", packing_id: 42 })).toBe("PACK-42");
  });

  it("returns em dash when nothing is usable", () => {
    expect(displayOrderLineSku({})).toBe("—");
  });
});
