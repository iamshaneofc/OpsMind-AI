import { describe, expect, it } from "vitest";
import { buildLaneAOrderSnapshot } from "./lane-a-snapshot";

describe("buildLaneAOrderSnapshot", () => {
  it("uses ERP removal date in expected delivery band when DELIVERED and dateOfRemoval is set", () => {
    const s = buildLaneAOrderSnapshot({
      status: "DELIVERED",
      orderNumber: "11.105.260217.24",
      voucherDate: "2026-02-17",
      expectedDeliveryDate: "2026-03-01",
      dateOfRemoval: "2026-03-05",
      isStockTransferOrder: false,
    });
    expect(s.external_status).toBe("DELIVERED");
    expect(s.expected_delivery_band.center_date).toBe("2026-03-05");
    expect(s.expected_delivery_band.label).toMatch(/Delivered|removal/i);
    expect(s.next_update_by).toBeNull();
    expect(s.next_action).toBe("wait");
    expect(s.status_confidence).toBe("HIGH");
  });

  it("DELIVERED without removal date states no removal in ERP", () => {
    const s = buildLaneAOrderSnapshot({
      status: "DELIVERED",
      orderNumber: "11.105.260217.24",
      voucherDate: "2026-02-17",
      expectedDeliveryDate: "2026-03-01",
      isStockTransferOrder: false,
    });
    expect(s.expected_delivery_band.label).toMatch(/Delivered|no removal/i);
    expect(s.expected_delivery_band.center_date).toBeNull();
  });

  it("builds indicative window for IN_PREPARATION when estimated delivery exists", () => {
    const s = buildLaneAOrderSnapshot({
      status: "IN_PREPARATION",
      orderNumber: "1.2.3.4",
      voucherDate: "2026-01-01",
      expectedDeliveryDate: "2026-02-15",
      isStockTransferOrder: false,
    });
    expect(s.external_status).toBe("IN_PREPARATION");
    expect(s.expected_delivery_band.window_start).toBeTruthy();
    expect(s.expected_delivery_band.window_end).toBeTruthy();
    expect(s.next_update_by).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("escalates AWAITING_FACTORY when voucher age crosses FACTORY_STALE_ESCALATION_DAYS", () => {
    const prev = process.env.FACTORY_STALE_ESCALATION_DAYS;
    process.env.FACTORY_STALE_ESCALATION_DAYS = "14";
    const s = buildLaneAOrderSnapshot({
      status: "AWAITING_FACTORY",
      orderNumber: "1.2.3.4",
      voucherDate: "2026-01-01",
      expectedDeliveryDate: "2026-06-01",
      isStockTransferOrder: false,
      awaitingFactoryAgeDays: 20,
      truthSignals: ["awaiting_factory"],
      predictionVersion: "phase1:v1",
    });
    expect(s.next_action).toBe("escalate");
    expect(s.prediction_version).toBe("phase1:v1");
    process.env.FACTORY_STALE_ESCALATION_DAYS = prev;
  });
});
