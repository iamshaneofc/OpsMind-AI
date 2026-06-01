# Phase 1 Backend Solution Plan (Post DB Owner Meeting)

Date: 2026-04-30  
Prepared for: ERP + Backend implementation alignment  
Scope: Backend-first solution where DB team cannot add most Phase 1 fields now

## 1) Decision Summary from Meeting

Based on DB owner feedback:

- Gap A: Local allocation will be manually maintained (with authorized distributors) and treated as explicit input.
- Gap B: Status event history table is not feasible now at ERP scale; backend must continue deriving current state.
- Gap C + Gap D: ETA and next-update commitment fields will not be maintained by DB team; backend must predict.
- Gap E: Dispatched state must be detected from existing ERP fields (no dedicated dispatch model now).
- Gap F: Awaiting factory must be inferred from existing request flags when not explicitly modeled.
- Gap G: Distributor-company mapping remains as-is (no immediate DB refactor).
- Gap H: Central warehouse is Bhiwandi; local mapping can come from manual tagging and/or existing location IDs.

## 2) Live ERP Validation (2026-04-30)

ERP was checked from backend scripts against `SiscoERP` with production-scale volume:

- `dbo.sales_order_header`: 740,173 rows
- `dbo.sales_order_body`: 3,517,677 rows
- `dbo.Sales_Invoice_Header`: 374,864 rows
- `dbo.Sales_Invoice_Body`: 3,730,654 rows
- `dbo.Location`: 11 rows

Key findings relevant to the gaps:

- Missing proposed fields (all absent):  
  `is_local_allocated`, `local_allocated_at`, `next_update_by`, `eta_band_code`, `dispatch_status`, `awb_or_consignment_no`, `factory_dependency_type`, `warehouse_role`, `servicing_warehouse_id`, `allocation_source_warehouse_id` (and related fields).
- `BhiwandiDepot` exists in `dbo.Location` as `Location_id = 6` (usable as central warehouse anchor).
- Dispatch proxy signal currently available:
  - `Sales_Invoice_Header.confirmed`
  - `Sales_Invoice_Header.DATE_OF_REMOVAL`
  - `Sales_Invoice_Header.TRANSPORT_NAME`
  - `Sales_Invoice_Header.VEHICLE_NUMBER`
- Factory proxy signal currently available:
  - `sales_order_body.request_initialised`
  - `sales_order_body.request_processed`

Sample inferred status distribution on latest 50k orders (query-time snapshot):

- `DELIVERED`: 45,676
- `ORDER_RECEIVED`: 4,290
- `AWAITING_FACTORY`: 31
- `ALLOCATED_CENTRAL_WAREHOUSE`: 3

Important observation:

- `confirmed = 1 AND DATE_OF_REMOVAL IS NULL` count was `0` in this snapshot.  
  This means `DISPATCH_READY` cannot rely only on this combination in your current data; backend needs fallback dispatch heuristics.

## 3) Backend Solution by Gap

## Gap A - Local Allocation (manual + authorized distributors)

### Backend approach

- Add a backend-owned manual allocation table in Supabase (not ERP):
  - `erp_order_manual_allocation`
  - `sales_order_id`
  - `sales_order_body_id` (nullable)
  - `allocation_type` (`LOCAL` | `CENTRAL`)
  - `allocated_location_id` (ERP `Location_id`)
  - `updated_by`, `updated_at`, `source='manual'`
- Restrict write access to authorized users only.
- In status derivation, this manual flag gets highest priority for local/central decision.

### Rule

- If manual `allocation_type = LOCAL` => `ALLOCATED_LOCAL_WAREHOUSE`.
- If manual `allocation_type = CENTRAL` => `ALLOCATED_CENTRAL_WAREHOUSE`.
- If no manual row => fallback to ERP inference logic.

## Gap B - No status event table in ERP

### Backend approach

- Keep current derived-status engine from ERP tables.
- Add backend event journaling in Supabase (delta tracking):
  - `erp_order_status_snapshots`
  - `sales_order_id`, `derived_status`, `derived_at`
  - `reason_json` (which ERP signals triggered state)
- On every fetch/job, compare new derived status to latest saved status:
  - if changed, append event row.

### Outcome

- You get an auditable status timeline without ERP schema changes.
- Supports SLA reports and “what changed since last check”.

## Gap C + Gap D - ETA and Next Update not maintained by DB

### Backend approach

- Replace fixed placeholder offsets with data-driven prediction using historical ERP patterns.
- Build route-level SLA baselines from delivered orders:
  - keys: warehouse (`analysis_id` or `Despatch_Location_ID`) + shipping type + distributor/account segment
  - metrics: P50/P75 transit+processing days
- Predict:
  - `expected_delivery_band` from percentile windows
  - `next_update_by` from status-specific cadence and overdue policy

### Model v1 (practical)

- `ORDER_RECEIVED`: next update in 1 day
- `ALLOCATED_LOCAL_WAREHOUSE`: 1 day
- `ALLOCATED_CENTRAL_WAREHOUSE`: 2 days
- `IN_PREPARATION`: 1-2 days
- `AWAITING_FACTORY`: 2 days (or earlier if historically delayed)
- `DISPATCH_READY`: 1 day
- Overdue expected date: next update set to tomorrow + escalation hint

### Storage

- Persist generated ETA + next update outputs in backend cache table:
  - `erp_order_predictions`
  - `sales_order_id`, `predicted_eta_start`, `predicted_eta_end`, `next_update_by`, `model_version`, `generated_at`

## Gap E - Detect dispatch state from existing ERP data

### Problem

- Dedicated dispatch fields/AWB model are absent.
- Current `confirmed=1 && DATE_OF_REMOVAL IS NULL` may be weak in your live data.

### Backend dispatch detection (priority order)

1. If `DATE_OF_REMOVAL` present => `DELIVERED`.
2. Else if invoice linked and any logistics hint exists (`TRANSPORT_NAME` or `VEHICLE_NUMBER`) => treat as `DISPATCH_READY` with lower confidence.
3. Else if invoice linked (confirmed or unconfirmed) => `IN_PREPARATION`.
4. Else follow forwarded/factory/received logic.

### Add confidence scoring

- `dispatch_confidence = HIGH` when `DATE_OF_REMOVAL` exists
- `dispatch_confidence = MEDIUM` when invoice + transport identifiers exist
- `dispatch_confidence = LOW` when invoice-only inference

## Gap F - Awaiting Factory inference

### Backend approach

- Keep current rule:
  - `request_initialised = 1` and `request_processed = 0` => `AWAITING_FACTORY`
- Add stale-wait guard:
  - if this state remains unchanged for N days, mark next action as `raise_udr` or `escalate`.

### Enhancement

- Add backend “factory reason hint” from notes/tickets where available (if any app-side notes exist), without requiring ERP schema change.

## Gap G - Mapping stays as-is

### Backend approach

- Continue using existing distributor-to-ERP-account mapping path.
- Add integrity checks:
  - no distributor without ERP account mapping
  - no inactive/duplicate account entries
- Run nightly mismatch report to prevent visibility leakage.

## Gap H - Central vs local semantics

### Backend approach

- Hard-code central location for Phase 1:
  - `central_location_id = 6` (`BhiwandiDepot`)
- Local assignment source:
  - manual allocation table (Gap A)
  - optional location-based mapping config in backend

### State mapping rule

- `ALLOCATED_CENTRAL_WAREHOUSE` when:
  - manual central allocation, or
  - `Order_Forwarded = 1`, or
  - allocated location equals central location id.
- `ALLOCATED_LOCAL_WAREHOUSE` only when manual local allocation exists (avoid weak inference).

## 4) Implementation Plan (Backend-first, no ERP schema dependency)

### Week 1 (must-do)

1. Add manual allocation table + APIs + role authorization.
2. Add status snapshot/event journaling table.
3. Add dispatch detection v2 with confidence scoring.
4. Add central warehouse config (`Location_id=6`) and state routing rules.

### Week 2 (stability + trust)

5. Add historical ETA/next-update prediction module.
6. Add overdue policy engine (UDR/escalation triggers).
7. Add mapping integrity checks + nightly diagnostics.
8. Publish status confidence in API response for transparency.

## 5) SQL Checks to Keep Running Weekly

Use these checks for ongoing verification:

1. Status spread trend:
   - reuse `check_status.sql` logic.
2. Dispatch proxy health:
   - invoices with `DATE_OF_REMOVAL` vs only logistics identifiers.
3. Factory queue health:
   - `request_initialised=1` and `request_processed=0` counts by aging bucket.
4. Location governance:
   - verify central location entry remains `BhiwandiDepot (Location_id=6)`.

## 6) Backend Output Contract Changes (recommended)

Add these to Lane A response:

- `status_confidence`: `HIGH | MEDIUM | LOW`
- `status_reason_signals`: array of ERP fields used to derive status
- `dispatch_confidence`
- `prediction_version`

This keeps user trust high even when state is inferred.

## 7) Final Recommendation

Given current DB constraints, Phase 1 should proceed with a backend-governed truth layer:

- manual local/central allocation capture,
- deterministic status derivation with traceability,
- historical ETA/next-update prediction,
- explicit confidence flags.

This gives stable and explainable outputs now, while keeping a clean upgrade path for future ERP-native fields.
