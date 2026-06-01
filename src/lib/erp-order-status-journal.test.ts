import { describe, expect, it } from "vitest";
import { fingerprintDerivedLifecycle } from "./erp-order-status-journal";

describe("fingerprintDerivedLifecycle", () => {
  it("matches when status, removal, and manual overlay match", () => {
    const a = fingerprintDerivedLifecycle({
      status: "DELIVERED",
      removalDate: "2026-03-01",
      manual_allocation: null,
      dispatch_confidence: "HIGH",
      dispatch_reason_code: "DELIVERY_REMOVAL",
      has_transport_hint: false,
      truth_signals: [],
    });
    const b = fingerprintDerivedLifecycle({
      status: "DELIVERED",
      removalDate: "2026-03-01",
      manual_allocation: null,
      dispatch_confidence: "HIGH",
      dispatch_reason_code: "DELIVERY_REMOVAL",
      has_transport_hint: false,
      truth_signals: [],
    });
    expect(a).toBe(b);
  });

  it("differs when manual_allocation differs", () => {
    const noManual = fingerprintDerivedLifecycle({
      status: "ORDER_RECEIVED",
      removalDate: null,
      manual_allocation: null,
      dispatch_confidence: null,
      dispatch_reason_code: null,
      has_transport_hint: false,
      truth_signals: [],
    });
    const local = fingerprintDerivedLifecycle({
      status: "ORDER_RECEIVED",
      removalDate: null,
      manual_allocation: {
        allocation_type: "LOCAL",
        allocated_location_id: 9,
        notes: null,
      },
      dispatch_confidence: null,
      dispatch_reason_code: null,
      has_transport_hint: false,
      truth_signals: [],
    });
    expect(noManual).not.toBe(local);
  });
});
