/** Gap E helpers: infer dispatch-ready / confidence from dbo.Sales_Invoice_Header proxy fields */

export type DispatchConfidence = "HIGH" | "MEDIUM" | "LOW";

/** Why `dispatch_confidence` was assigned (orthogonal to conversational explanation). */
export type DispatchReasonCode =
  | "DELIVERY_REMOVAL"
  | "CONFIRMED_INVOICE_WITH_LOGISTICS"
  | "CONFIRMED_INVOICE_ONLY"
  | "LOGISTICS_PROXY";

/** Non-empty trimmed string after trim considered a logistics hint. */
export function hasTransportHint(
  transportName: string | null | undefined,
  vehicleNumber: string | null | undefined,
): boolean {
  const a = typeof transportName === "string" ? transportName.trim() : "";
  const b = typeof vehicleNumber === "string" ? vehicleNumber.trim() : "";
  return a.length > 0 || b.length > 0;
}

export function finalizeDispatchEvidence(params: {
  erpBareStatus: string;
  invoice:
    | {
        confirmed: boolean | null;
        TRANSPORT_NAME: string | null;
        VEHICLE_NUMBER: string | null;
      }
    | undefined;
  /** How DISPATCH_READY was reached when status is dispatch-ready */
  dispatchReadySource?: "confirmed" | "logistics_proxy";
}): {
  dispatch_confidence: DispatchConfidence | null;
  dispatch_reason_code: DispatchReasonCode | null;
  has_transport_hint: boolean;
} {
  const invoice = params.invoice;
  const hint = invoice
    ? hasTransportHint(invoice.TRANSPORT_NAME, invoice.VEHICLE_NUMBER)
    : false;

  if (!invoice || params.erpBareStatus === "DELIVERED") {
    const st = params.erpBareStatus;
    if (st === "DELIVERED") {
      return {
        dispatch_confidence: "HIGH",
        dispatch_reason_code: "DELIVERY_REMOVAL",
        has_transport_hint: hint,
      };
    }
    return { dispatch_confidence: null, dispatch_reason_code: null, has_transport_hint: hint };
  }

  if (params.erpBareStatus === "DISPATCH_READY") {
    if (params.dispatchReadySource === "confirmed") {
      return hint
        ? {
            dispatch_confidence: "MEDIUM",
            dispatch_reason_code: "CONFIRMED_INVOICE_WITH_LOGISTICS",
            has_transport_hint: true,
          }
        : {
            dispatch_confidence: "LOW",
            dispatch_reason_code: "CONFIRMED_INVOICE_ONLY",
            has_transport_hint: false,
          };
    }
    if (params.dispatchReadySource === "logistics_proxy") {
      return {
        dispatch_confidence: "MEDIUM",
        dispatch_reason_code: "LOGISTICS_PROXY",
        has_transport_hint: true,
      };
    }
    return {
      dispatch_confidence: hint ? ("MEDIUM" as DispatchConfidence) : ("LOW" as DispatchConfidence),
      dispatch_reason_code: hint ? "CONFIRMED_INVOICE_WITH_LOGISTICS" : "CONFIRMED_INVOICE_ONLY",
      has_transport_hint: hint,
    };
  }

  return { dispatch_confidence: null, dispatch_reason_code: null, has_transport_hint: hint };
}
