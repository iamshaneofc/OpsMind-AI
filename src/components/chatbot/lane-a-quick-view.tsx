"use client";

import type { LaneAOrderSnapshot, LaneANextAction } from "@/types/lane-a";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

/** Ordered list of the 7 canonical states for progress display */
const STATE_SEQUENCE = [
  "ORDER_RECEIVED",
  "ALLOCATED_LOCAL_WAREHOUSE",
  "ALLOCATED_CENTRAL_WAREHOUSE",
  "IN_PREPARATION",
  "AWAITING_FACTORY",
  "DISPATCH_READY",
  "DELIVERED",
];

const STATE_LABELS: Record<string, string> = {
  ORDER_RECEIVED: "Order Received",
  ALLOCATED_LOCAL_WAREHOUSE: "Allocated – Local Warehouse",
  ALLOCATED_CENTRAL_WAREHOUSE: "Allocated – Central Warehouse",
  IN_PREPARATION: "In Preparation",
  AWAITING_FACTORY: "Awaiting Factory",
  DISPATCH_READY: "Dispatched / Ready for Delivery",
  DELIVERED: "Delivered",
  PENDING: "Order Received",
};

const actionLabels: Record<LaneANextAction, string> = {
  wait: "Wait",
  raise_udr: "Raise UDR",
  request_transfer: "Request transfer",
  escalate: "Escalate",
};

function actionVariant(action: LaneANextAction): "default" | "secondary" | "warning" | "danger" | "success" {
  if (action === "escalate") return "danger";
  if (action === "raise_udr") return "warning";
  if (action === "request_transfer") return "default";
  return "secondary";
}

interface LaneAQuickViewProps {
  snapshot: LaneAOrderSnapshot;
  orderNumber?: string | null;
}

export function LaneAQuickView({ snapshot, orderNumber }: LaneAQuickViewProps) {
  const title = orderNumber ? `Order truth layer — ${orderNumber}` : "Order truth layer";
  const isDelivered = snapshot.external_status === "DELIVERED";
  const stateLabel = STATE_LABELS[snapshot.external_status] ?? snapshot.external_status;
  const stepIndex = STATE_SEQUENCE.indexOf(snapshot.external_status);
  const stepDisplay = stepIndex >= 0 ? `Step ${stepIndex + 1} of ${STATE_SEQUENCE.length}` : null;

  return (
    <Card className="border-emerald-500/30 bg-emerald-950/35">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-emerald-200">{title}</CardTitle>
        <CardDescription className="text-xs text-emerald-200/80">
          {isDelivered
            ? "Completed order — delivered."
            : "Estimated delivery and next steps — not a guaranteed delivery commitment."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isDelivered ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-emerald-300/90">Status</span>
              <Badge className="font-mono text-xs bg-emerald-600/30 text-emerald-100 hover:bg-emerald-600/40 border-emerald-500/50">
                {stateLabel} ✅
              </Badge>
              {stepDisplay && (
                <span className="text-xs text-emerald-300/60">{stepDisplay}</span>
              )}
            </div>
            
            <p className="text-sm leading-relaxed text-emerald-50/95">{snapshot.explanation}</p>

            <div className="rounded-md border border-emerald-500/20 bg-emerald-950/40 p-4 space-y-4">
              {snapshot.date_of_removal && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-emerald-300/90">Delivered On</span>
                  <span className="text-sm font-medium text-emerald-50">
                    {new Date(snapshot.date_of_removal).toLocaleDateString("en-IN", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              )}
              {snapshot.transport_name && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-emerald-300/90">Transport</span>
                  <span className="text-sm font-medium text-emerald-50">{snapshot.transport_name}</span>
                </div>
              )}
              {snapshot.transport_document_number && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-emerald-300/90">Tracking</span>
                  <span className="text-sm font-medium text-emerald-50">{snapshot.transport_document_number}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-emerald-300/90">Status</span>
              <Badge variant="secondary" className="text-xs">
                {stateLabel}
              </Badge>
              {stepDisplay && (
                <span className="text-xs text-emerald-300/60">{stepDisplay}</span>
              )}
            </div>

            <p className="text-sm leading-relaxed text-emerald-50/95">{snapshot.explanation}</p>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300/90">
                Estimated delivery window
              </p>
              <Table>
                <TableBody>
                  <TableRow className="border-emerald-500/20 hover:bg-emerald-500/10">
                    <TableCell className="w-[40%] font-medium text-emerald-200/90">Window</TableCell>
                    <TableCell className="text-emerald-50">{snapshot.expected_delivery_band.label}</TableCell>
                  </TableRow>
                  {snapshot.expected_delivery_band.center_date ? (
                    <TableRow className="border-emerald-500/20 hover:bg-emerald-500/10">
                      <TableCell className="font-medium text-emerald-200/90">Centre (heuristic)</TableCell>
                      <TableCell className="text-emerald-50">{snapshot.expected_delivery_band.center_date}</TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-start gap-3">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-300/90">Next update by</p>
                <p className="text-sm font-medium text-emerald-50">
                  {snapshot.next_update_by ?? "— (not applicable)"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-start gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-emerald-300/90">Suggested next step</span>
              <Badge variant={actionVariant(snapshot.next_action)} className="text-xs">
                {actionLabels[snapshot.next_action]}
              </Badge>
            </div>
            <p className="text-xs leading-relaxed text-emerald-200/85">{snapshot.next_action_reason}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
