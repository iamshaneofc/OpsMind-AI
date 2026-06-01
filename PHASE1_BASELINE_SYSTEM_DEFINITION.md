# Phase 1 Baseline - System Definition

## Context

SRL's portal already exposes ordering and visibility through ERP-connected workflows, but field execution shows that the current experience is not practical enough. The core problem is not lack of data; it is:

- trustworthy, low-friction access to order truth,
- structured updates from internal teams,
- predictable "next update by" commitments.

Phase 1 is intentionally scoped to stabilize this flow quickly and deliver measurable value without trying to solve the full supply chain in one release.

It also introduces ordering-time, distributor-friendly nudges to improve order value and inventory movement by surfacing:

- missed demand,
- relevant product adjacencies,
- time-sensitive opportunities.

The design principle is to support discovery without reducing ordering speed.

## Priority 1 North Star: Distributor Order Execution Visibility

Reduce uncertainty across the full order lifecycle, from distributor request to factory execution, by making status, "next update by", and exception handling:

- self-serve,
- indicative (not falsely precise),
- WhatsApp-native.

Expected outcomes:

- reduced inbound status calls to HQ and sales,
- high self-serve resolution by distributors and field agents,
- better factory-procurement responsiveness,
- stronger trust through predictable update commitments.

## Phase 1 Architecture (WhatsApp-Native Truth Layer)

Phase 1 uses two interaction lanes:

- Lane A: WhatsApp ASK (external + field consumption)
- Lane B: WhatsApp UPDATE (internal truth capture + workflow triggering)

### Lane A: WhatsApp ASK (Distributors + Field Agents)

Goal: Make status checks and lifecycle queries effortless for users on the move.

#### Authentication

- only pre-approved phone numbers can use Lane A,
- unregistered numbers receive a clear rejection response.

#### Query handling

User queries are expected to be vague or memory-based. The system must guide disambiguation through clarifying questions on:

- distributor name,
- order id (if known),
- approximate date,
- product/SKU (optional).

The system must not pretend it understands ambiguous input.

#### Response contract

Every Lane A answer must include:

- current status (mapped from internal states),
- simple language explanation,
- indicative ETA band,
- "next update by" date,
- next action (if any): wait, raise UDR, request transfer, escalate.

### Lane B: WhatsApp UPDATE (Factory, Warehouse, Procurement, Ops)

Goal: Capture operational truth and trigger workflows without desktop ERP dependency.

#### Conversational update patterns

Example: raw material shortage for a SKU.
The assistant should guide structured choices:

- check existing POs,
- raise procurement request,
- mark expected availability as temporarily unknown.

The same structured pattern applies for:

- batch started,
- QC hold,
- packed,
- dispatch-ready.

Each update flow should:

- capture structured data,
- update the truth layer,
- trigger downstream workflows (procurement queues, internal notifications),
- refresh external "next update by" where applicable.

#### Governance

- only internal whitelisted roles can use Lane B,
- selected update classes can require HITL approval before external reflection.

## External Visibility Model

Phase 1 exposes only the following distributor-facing lifecycle states:

1. Order Received
2. Allocated - Local Warehouse
3. Allocated - Central / Hub Warehouse
4. In Preparation
5. Awaiting Factory
6. Dispatched
7. Delivered

### State definitions and outward messages

#### 1) Order Received

Meaning:

- order accepted into SRL system,
- validation/credit/compliance checks complete or in progress.

User-facing message:

- "Order received and being processed."
- "Next update by: <date>"

#### 2) Allocated - Local Warehouse

Meaning:

- stock available and reserved at servicing local warehouse,
- no central/factory dependency.

User-facing message:

- "Order allocated at local warehouse and queued for dispatch."
- "Next update by: <date>"

#### 3) Allocated - Central / Hub Warehouse

Meaning:

- stock not available locally,
- available at central/hub warehouse,
- transfer or direct dispatch is planned.

User-facing message:

- "Order allocated at central warehouse and being arranged for dispatch."
- "Next update by: <date>"

#### 4) In Preparation

Meaning:

- operational handling in progress before dispatch:
  - repacking,
  - QC release,
  - documentation,
  - bundling,
  - compliance steps.

This is work-in-progress, not necessarily a delay.

User-facing message:

- "Order is being prepared for dispatch."
- "Next update by: <date>"

#### 5) Awaiting Factory

Meaning:

- product unavailable in local and central warehouses,
- manufacturing or raw-material dependency exists.

This is the only state that explicitly signals supply-side dependency.

User-facing message:

- "Order is awaiting factory production or raw material availability."
- "Next update by: <date>"

#### 6) Dispatched

Meaning:

- order shipped from warehouse/factory,
- AWB/consignment created.

User-facing message:

- "Order dispatched. Tracking details available."
- "Next update by: <date>"

#### 7) Delivered

Meaning:

- delivered to distributor.

User-facing message:

- "Order delivered."
- "Next update by: <date>"

### Non-negotiable rule

Every externally visible status must include:

- `Next update by: <date>`

This is a primary anxiety-reduction and follow-up-reduction mechanism, including when no immediate progress occurs.

## Lead Time Model (Indicative by Design)

ETA is communicated as a band, similar to e-commerce experiences.

Bands:

- Band A: 0-2 working days (local stock path)
- Band B: 3-7 working days (transfer/preparation path)
- Band C: 8-30 working days (factory/RM dependency path)
- Band D: Unknown (supplier uncertainty)

### Tightening triggers

ETA should become more precise only on hard operational events:

- stock reserved,
- batch started,
- AWB created (last-mile precision starts here).

Until those events occur, ETA remains indicative and paired with a "next update by" commitment.

## Acceptance Criteria for Phase 1 Baseline

### Lane A

- only whitelisted external/field users can access,
- ambiguous requests trigger clarification, not fabricated certainty,
- all responses include status, explanation, ETA band, next update by, and next action.

### Lane B

- only whitelisted internal roles can access,
- updates are captured in structured format,
- configured updates trigger workflow side effects,
- external truth and next-update commitments are updated when applicable,
- HITL approval path exists for controlled update classes.

### State and ETA governance

- all external statuses are restricted to the 7-state model,
- each state always includes "next update by",
- ETA bands follow the four-band model and tighten only on hard triggers.
