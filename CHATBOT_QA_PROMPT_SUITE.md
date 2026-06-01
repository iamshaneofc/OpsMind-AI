# Chatbot QA Prompt Suite (14 Critical Scenarios)

Use this suite to regression-test chat behavior after any backend prompt/tooling update.

## How To Run

- Run each prompt in a fresh chat session where possible.
- Capture assistant output and verify against the checks below.
- Mark each case as `PASS`, `FAIL`, or `PARTIAL`.
- For failures, record the exact response snippet and the expected behavior.

---

## 1) Distributor orders scope (Viraj) + 20 rows

- **Prompt:** `Show orders for Viraj Life Sciences`
- **Expected Outcome:**
  - Only Viraj orders are shown.
  - Response includes per-order value.
  - Response includes status distribution and timeline summary.
  - List shows up to 20 recent orders.
- **Validation Points:**
  - No cross-distributor leakage.
  - 20 rows max in table output.

## 2) Order tracking progression

- **Prompt:** `Track order 8.105.260218.38`
- **Expected Outcome:**
  - Shows current state.
  - Shows previous transitions.
  - Shows delivery stage.
- **Validation Points:**
  - State progression is logically consistent:
    - `Received -> Allocated Local -> Allocated Central warehouse -> In Prep -> Awaiting factory -> Dispatch -> Delivered`
- **Edge Cases:**
  - Skipped states.
  - Incorrect transitions.

## 3) Invoices linked to order

- **Prompt:** `List all invoices for order 8.105.260218.38`
- **Expected Outcome:**
  - Displays invoice ID, date, total value, status.
- **Validation Points:**
  - Invoice total equals sum of line items.
  - Invoice is linked to correct distributor.
- **Edge Cases:**
  - Multiple invoices per order.
  - Missing invoice.

## 4) Order line items detail

- **Prompt:** `Show detailed line items for order 8.105.260218.38`
- **Expected Outcome:**
  - Displays SKU, product name, quantity, line total.
- **Validation Points:**
  - `sum(line totals) = invoice value`.
  - SKU exists in product master.
- **Edge Cases:**
  - Missing SKU.
  - Zero quantity.

## 5) Distributor invoice total aggregation

- **Prompt:** `Show total invoice value for Viraj Life Sciences`
- **Expected Outcome:**
  - Displays total invoices or recent invoices with aggregate value clarity.
- **Validation Points:**
  - No duplicate counting.
- **Edge Cases:**
  - Partial data sync.
  - Incorrect aggregation.

## 6) Product-to-orders and distributor invoice linkage

- **Prompt:** `Sodium Chloride ACS, 99.9%`
- **Expected Outcome:**
  - Displays all matching orders containing this product.
  - Shows invoice linkage distributor-wise.
  - Shows distributor names.
- **Validation Points:**
  - Product appears only in correct orders.
  - SKU mapping is correct.
- **Edge Cases:**
  - Product not found.
  - Duplicate entries.

## 7) Product stock + related orders

- **Prompt:** `Acetic Acid Glacial ACS, 99.9%`
- **Expected Outcome:**
  - Shows stock across warehouses.
  - Shows related orders.
- **Validation Points:**
  - Stock aligns with order activity.
  - No negative inventory shown.
- **Edge Cases:**
  - Zero stock.
  - Stock mismatch.

## 8) Delivered orders by transport

- **Prompt:** `Which orders are delivered by Laxmi transport`
- **Expected Outcome:**
  - Displays delivered orders only.
  - Shows transport name and delivery date.
- **Validation Points:**
  - Transport mapping is correct.
  - Only delivered orders are included.
- **Edge Cases:**
  - No transport match.
  - Multiple transport naming variants.

## 9) Delayed orders list

- **Prompt:** `Show all delayed orders`
- **Expected Outcome:**
  - Displays orders exceeding expected timeline.
  - Includes distributor and state.
- **Validation Points:**
  - Delay logic is correct.
  - No false inclusion of normal active orders.
- **Edge Cases:**
  - No delayed orders.
  - False positives.

## 10) Pending orders = all non-delivered

- **Prompt:** `Show all pending orders`
- **Expected Outcome:**
  - Displays all non-delivered orders.
  - Does not require literal `PENDING` state in ERP model.
- **Validation Points:**
  - Delivered orders excluded.
  - All active states included.
- **Edge Cases:**
  - Misclassification.

## 11) Show all orders (segmented)

- **Prompt:** `Show all orders`
- **Expected Outcome:**
  - Recent orders shown.
  - Data clearly segmented/tagged per distributor.
- **Validation Points:**
  - No data mixing.
  - Correct distributor tagging.

## 12) Product -> order history -> stock flow

- **Prompt:** `Product -> order history -> stock`
- **Expected Outcome:**
  - Logical flow preserved:
    - `Product -> invoices -> orders -> stock`
- **Validation Points:**
  - No broken or reversed sequence.
- **Edge Cases:**
  - Inconsistent response ordering.

## 13) Language robustness + short name prompt

- **Prompt A:** `Hindi / Marathi mixed query`
- **Expected Outcome A:**
  - Correct interpretation.
  - Same operational results as English intent.
- **Validation Points A:**
  - No intent loss.

- **Prompt B:** `Show me viraj life sciences`
- **Expected Outcome B:**
  - Correct interpretation of distributor.
  - Shows relevant distributor data.
  - Offers helpful follow-up prompt (show more orders / ask next question).
- **Validation Points B:**
  - No intent loss.

## 14) Cross-check order vs invoice consistency

- **Prompt:** `Cross-check order vs invoice`
- **Expected Outcome:**
  - Matching data across order and invoice modules.
- **Validation Points:**
  - No mismatch between modules.
  - Sync lag minimal/acceptable.

## 15) Supply Chain Visibility (Out of Stock / Factory Pending)

- **Prompt:** `Why is Ammonium Phosphate Monobasic for HPLC out of stock?`
- **Expected Outcome:**
  - Chatbot calls `getProductSupplyStatus`.
  - Explains that the product is "Awaiting Factory" or out of stock.
  - Mentions pending requisitions if any (e.g. "75 units pending since Feb 1st").
  - Mentions raw material status (e.g. "75 units of AR grade in stock, waiting for packing").
- **Validation Points:**
  - Traces from finished product to raw materials.
  - Provides specific quantities and dates from ERP.
- **Edge Cases:**
  - No BOM found.
  - No pending requisitions.

---

## Suggested Result Log Template

Use one line per scenario in your QA run notes:

`Case # | PASS/FAIL/PARTIAL | Prompt used | Key output observed | Validation notes | Action`

