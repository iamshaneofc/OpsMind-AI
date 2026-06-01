# Phase 1 ERP Gap Document for Database Owner

Date: 2026-04-14  
Prepared for: ERP/DB Owner Meeting  
Scope: Non-WhatsApp data model readiness for Phase 1 order truth outputs

## 1) Objective

This document lists what is already working in the current ERP integration, and what database additions/adjustments are still required so Phase 1 can reliably produce:

- all 7 external order states,
- trustworthy status explanations,
- indicative ETA bands,
- "next update by" commitments,
- operational next actions (wait/raise UDR/request transfer/escalate).

The goal is to help you align on database changes that can be made manually in ERP/DB so the application outputs become stable and fully trustworthy.

## 2) Current Coverage (Already Implemented)

The following is already implemented in code and connected to ERP SQL Server:

- 7-state lifecycle derivation exists in app logic:
  - `ORDER_RECEIVED`
  - `ALLOCATED_LOCAL_WAREHOUSE` (currently inferred)
  - `ALLOCATED_CENTRAL_WAREHOUSE`
  - `IN_PREPARATION`
  - `AWAITING_FACTORY`
  - `DISPATCH_READY` (maps to "Dispatched")
  - `DELIVERED`
- Core status derivation currently uses:
  - `dbo.sales_order_header`
  - `dbo.sales_order_body`
  - `dbo.Sales_Invoice_Header`
  - `dbo.Sales_Invoice_Body`
- Lane A response object is produced with:
  - external status
  - explanation
  - expected delivery band (indicative)
  - next update by
  - next action + reason
- Distributor/account scoping is partially handled through ERP account mapping.
- Warehouse/location lookups are functioning through `dbo.Location`.

## 3) Critical Gaps (Database-side) Blocking Full Trust

These are the most important missing data points in ERP.

### Gap A - No explicit "Allocated Local Warehouse" event/flag

Current issue:
- Local allocation is inferred when no stronger signal exists.
- This can be wrong in edge cases and weakens confidence.

Required DB change:
- Add an explicit local allocation signal at order line or order header level.

Recommended fields:
- `is_local_allocated` (bit)
- `local_allocated_at` (datetime)
- `local_allocated_by` (varchar/user id)
- optional `allocated_location_id` (int, FK to `Location`)

Why it matters:
- Distinguishes true local allocation from generic "received/preparing" state.

---

### Gap B - No explicit state transition history table

Current issue:
- App derives current state from scattered flags/invoice values.
- No auditable progression with timestamps for each state transition.

Required DB change:
- Add a status event/history table for each order (or order line).

Recommended table:
- `order_status_events`
  - `id` (PK)
  - `sales_order_id` (FK)
  - `sales_order_body_id` (nullable FK)
  - `status_code` (varchar)  
    Allowed values: `ORDER_RECEIVED`, `ALLOCATED_LOCAL_WAREHOUSE`, `ALLOCATED_CENTRAL_WAREHOUSE`, `IN_PREPARATION`, `AWAITING_FACTORY`, `DISPATCHED`, `DELIVERED`
  - `event_time` (datetime, required)
  - `event_source` (varchar: ERP/system/manual/factory/procurement)
  - `remarks` (varchar/text)
  - `created_by` (varchar/user id)

Why it matters:
- Enables accurate timeline, SLA monitoring, and confidence in "next update by".

---

### Gap C - ETA is placeholder logic, not ERP commitment data

Current issue:
- ETA and bands are generated from hardcoded offsets.
- Not tied to committed operational promises.

Required DB change:
- Add ETA commitment fields and revision tracking.

Recommended fields (header-level minimum):
- `eta_band_code` (varchar: `A/B/C/D`)
- `eta_start_date` (date)
- `eta_end_date` (date)
- `eta_confidence` (varchar/int optional)
- `eta_last_updated_at` (datetime)
- `eta_source` (varchar: stock/factory/logistics/manual)
- `eta_revision_count` (int)

Recommended history table:
- `order_eta_revisions`
  - previous and revised ETA window
  - reason
  - updated_at/by

Why it matters:
- Converts ETA from estimate to governed commitment.

---

### Gap D - "Next update by" is not persisted in ERP

Current issue:
- Next update date is policy-computed in app, not owned by ops/factory/procurement.

Required DB change:
- Store commitment date in DB with owner and reason.

Recommended fields:
- `next_update_by` (datetime/date)
- `next_update_owner_role` (varchar: warehouse/procurement/factory/ops)
- `next_update_reason` (varchar/text)
- `next_update_set_at` (datetime)
- `next_update_set_by` (varchar)

Why it matters:
- This is the key anxiety-reduction promise in Phase 1.

---

### Gap E - Dispatched state lacks dedicated logistics identity

Current issue:
- `DISPATCH_READY` is inferred from invoice `confirmed`.
- Tracking document uses `VEHICLE_NUMBER` proxy, not explicit AWB/consignment model.

Required DB change:
- Add explicit dispatch/logistics fields.

Recommended fields:
- `dispatch_status` (varchar: `READY`, `DISPATCHED`, `IN_TRANSIT`, `DELIVERED`)
- `dispatched_at` (datetime)
- `awb_or_consignment_no` (varchar)
- `transporter_name` (varchar)
- `vehicle_number` (varchar)
- `tracking_url` (varchar, optional)
- `handover_confirmed_by` (varchar)

Why it matters:
- Supports clean mapping of baseline state #6 ("Dispatched. Tracking available.").

---

### Gap F - Awaiting Factory is under-modeled

Current issue:
- Only `request_initialised/request_processed` is used.
- No structured cause, owner, expected resolution window.

Required DB change:
- Add structured factory dependency fields.

Recommended fields:
- `factory_dependency_type` (varchar: RM_SHORTAGE/CAPACITY/QC/OTHER)
- `factory_request_id` (varchar/int)
- `factory_eta_start` (date)
- `factory_eta_end` (date)
- `factory_last_update_at` (datetime)
- `factory_last_update_note` (text)
- `procurement_ticket_id` (varchar/int, optional)

Why it matters:
- Makes "Awaiting Factory" transparent and actionable.

---

### Gap G - Company/distributor mapping not native in ERP

Current issue:
- App notes missing robust company mapping in SQL path.
- Current access relies on account matching and app-side mapping.

Required DB change:
- Stabilize one-to-many mapping between distributor entity and ERP account IDs.

Recommended table:
- `distributor_account_map`
  - `distributor_code`
  - `erp_account_id`
  - `is_active`
  - `effective_from`, `effective_to`

Why it matters:
- Prevents visibility mismatches and access leakage risks.

---

### Gap H - Central vs local warehouse semantics are not explicit

Current issue:
- `analysis_id` and body location fields are used as heuristic.
- Not explicit whether source is local service warehouse or central hub.

Required DB change:
- Add warehouse role classification and explicit servicing warehouse assignment.

Recommended:
- In `Location` table:
  - `warehouse_role` (`LOCAL`, `CENTRAL`, `HUB`, `FACTORY`)
- In order header:
  - `servicing_warehouse_id`
  - `allocation_source_warehouse_id`

Why it matters:
- Accurate mapping for states #2 and #3.

---

### Gap I - Local warehouse allocation basis is not defined consistently

Question to resolve with owner:
- Should **every distributor** always be tied to one fixed local warehouse, or should allocation be dynamic per order/SKU availability?

Recommended decision:
- Do **not** force one global rule for all distributors.
- Use a **rule-based allocation policy** with clear DB fields and priority sequence.

Recommended allocation base (priority order):
1. Hard-mapped servicing warehouse for distributor (if active and serviceable).
2. Pincode/territory route mapping (distributor ship-to location to nearest eligible warehouse).
3. SKU availability and ATP at local warehouses.
4. SLA promise window (choose warehouse that can meet earliest committed band).
5. Cost/transfer constraints (DG rules, route restrictions, transfer not allowed).
6. If none qualifies, auto-classify as central/hub allocation.

Recommended DB model additions:
- `distributor_servicing_warehouse`
  - `distributor_code`
  - `warehouse_id`
  - `is_primary` (bit)
  - `priority_rank` (int)
  - `effective_from`, `effective_to`
  - `is_active`
- `warehouse_serviceability_rule`
  - `warehouse_id`
  - `state_code` / `district_code` / `pincode_prefix`
  - `serviceable` (bit)
  - `sla_days_min`, `sla_days_max`
- `order_allocation_decision`
  - `sales_order_id`
  - `allocated_warehouse_id`
  - `allocation_type` (`LOCAL` or `CENTRAL`)
  - `allocation_rule_applied`
  - `allocation_decided_at`
  - `allocation_decided_by` (`SYSTEM`/user)
  - `override_reason` (nullable)

Operational rule for Phase 1 status mapping:
- `ALLOCATED_LOCAL_WAREHOUSE` only when `allocation_type = LOCAL` and `allocated_warehouse_id` is populated.
- `ALLOCATED_CENTRAL_WAREHOUSE` when `allocation_type = CENTRAL` or order is explicitly forwarded to central.
- Never infer local allocation only by absence of invoice.

Why it matters:
- This directly answers "allocated for all distributors or on what basis?"
- It creates a defensible, auditable, and explainable allocation path per order.

## 4) Medium Priority Gaps (Useful for Phase 1 Stability)

### M1 - Delay reason and UDR linkage
- Add:
  - `is_delayed` (bit)
  - `delay_reason_code`
  - `delay_reason_text`
  - `udr_ticket_id`
  - `escalation_level`

### M2 - Proforma invoice linkage (if business uses proforma stage)
- Add proforma header/body with order linkage.

### M3 - Dispatch queue ownership metadata
- Add:
  - `dispatch_queue_entered_at`
  - `dispatch_queue_priority`
  - `dispatch_owner`

### M4 - Structured internal notes
- Add standardized note categories:
  - `ops_note`
  - `warehouse_note`
  - `procurement_note`
  - `factory_note`

## 5) Canonical Status Mapping Recommendation (DB Governance)

To avoid drift, keep one canonical status dictionary in DB:

- `ORDER_RECEIVED`
- `ALLOCATED_LOCAL_WAREHOUSE`
- `ALLOCATED_CENTRAL_WAREHOUSE`
- `IN_PREPARATION`
- `AWAITING_FACTORY`
- `DISPATCHED`
- `DELIVERED`

Important:
- Current app uses `DISPATCH_READY` internally.  
  Recommended: either
  - store `DISPATCHED` in DB and map internally, or
  - store both `DISPATCH_READY` and `DISPATCHED` with clear transition rules.

## 6) Suggested Implementation Order for DB Owner

### Week 1 (Must-have for reliable outputs)
1. Add explicit local allocation fields (Gap A).
2. Add status event table with timestamps (Gap B).
3. Add `next_update_by` commitment fields (Gap D).
4. Add dispatch tracking fields including AWB/consignment (Gap E).

### Week 2 (High-value trust improvements)
5. Add ETA commitment/revision model (Gap C).
6. Add factory dependency structure (Gap F).
7. Normalize distributor-account mapping (Gap G).
8. Classify warehouses + servicing/allocation ids (Gap H).

## 7) SQL Change Checklist (Owner Copy/Paste Agenda)

- Create/alter tables for:
  - `order_status_events`
  - ETA fields + `order_eta_revisions`
  - dispatch tracking fields
  - factory dependency fields
  - distributor account map
  - warehouse role classification
- Backfill existing live orders with:
  - current canonical status,
  - initial `next_update_by`,
  - current ETA band (`A/B/C/D`),
  - dispatch identifiers where available.
- Define DB constraints:
  - status enum/domain check,
  - non-null `event_time` for status events,
  - valid date range checks (`eta_start_date <= eta_end_date`).
- Define update ownership:
  - which role updates which fields,
  - mandatory fields per transition.

## 8) Meeting Talking Points (Quick)

- "Current system works, but some states are inferred and not auditable."
- "We need DB-native commitments for ETA and next update date."
- "We need explicit dispatch identity (AWB/consignment), not proxy fields."
- "We need status transition history to reduce disputes and follow-up calls."
- "If we implement the critical gaps, Phase 1 outputs become consistent and trustworthy."

## 9) Appendix - Current ERP Fields Already Used by App

### Sales order header
- `sales_order_id`
- `voucher_number`
- `voucher_date`
- `account_id`
- `analysis_id`
- `shipping_type_ID`
- `customer_po_number`
- `Total_Order_Amount`

### Sales order body
- `sales_order_body_id`
- `sales_order_id`
- `Order_Forwarded`
- `request_initialised`
- `request_processed`
- `Despatch_Location_ID`
- `order_qty`
- `net_order_qty`
- `Item_Total_Amount`

### Sales invoice header
- `sales_invoice_header_id`
- `voucher_number`
- `voucher_date`
- `confirmed`
- `DATE_OF_REMOVAL`
- `INVOICE_AMOUNT`
- `TRANSPORT_NAME`
- `VEHICLE_NUMBER`
- `account_id`

### Sales invoice body
- `sales_invoice_header_id`
- `sales_order_body_id`
- `qty`
- `item_amount`

### Master tables
- `ACCOUNT_MASTER (ACCOUNT_ID, FULL_NAME)`
- `Location (Location_id, Description, Address)`

