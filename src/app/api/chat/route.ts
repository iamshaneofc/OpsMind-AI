import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { getOpenAIClient, normalizeApiKey } from "@/ai/openai";
import { aiTools, executeTool } from "@/ai/tools";
import { loadCompanyErpAccounts, mapRoleIdToAppRole, requireAuthenticatedUser } from "@/services/auth";
import { createSupabaseAdminClient } from "@/supabase/admin";
import type { UserProfile } from "@/types/auth";
import { appendOrderItemsSectionIfMissing, extractOrderItemsFromToolMessages } from "@/lib/chat-order-items-append";
import { appendProductCardJsonBlockIfMissing, extractProductCardFromToolMessages } from "@/lib/chat-product-card-append";
import { displayOrderLineSku } from "@/lib/order-line-display";
import { getOrdersForRole } from "@/services/operations";
import { isSqlServerDataEnabled } from "@/sql-server/config";
import { deriveOrderStatusFromERP } from "@/sql-server/order-lifecycle";
import { looksLikeErpInvoiceVoucherNumber } from "@/sql-server/operations";
import { querySqlServer } from "@/sql-server/client";

/** Order rows included in chat markdown tables; Quick View shows eight until the user expands. */
const CHAT_ORDER_LIST_TABLE_MAX = 20;

/** ERP `dbo.Location.Location_id` for BhiwandiDepot — default “central warehouse” for chat (override with ERP_CENTRAL_WAREHOUSE_LOCATION_ID). */
const DEFAULT_ERP_CENTRAL_WAREHOUSE_LOCATION_ID = 6;

/** TEMP: Sub-status column for local-warehouse shortcut only. */
const TEMP_LOCAL_WAREHOUSE_SUB_STATUS = "Local warehouse";

/** TEMP: Sub-status column for central-warehouse shortcut only. */
const TEMP_CENTRAL_WAREHOUSE_SUB_STATUS = "Central warehouse";

const SYSTEM_PROMPT = `You are SRL Operations AI, a professional operations assistant for SRL Chemicals.

TYPO HANDLING (PRODUCT/ORDER DOMAIN ONLY):
1. Check for likely typos only when the user appears to be asking about a product, order, invoice, inventory, dispatch, or warehouse.
2. If there is a clear typo in a product or chemical name, acknowledge it briefly and continue with the requested action.
3. Do not force typo correction for unrelated/non-product questions and do not let typo handling override the user's intent.

⚠️ LIST FORMATTING RULE — MANDATORY:
- When you write a numbered list of products (1. product... 2. product...), NEVER append any text, question, or sentence to the last item.
- ALL follow-up questions or clarifying sentences (e.g. "Could you please specify which one you are interested in?") MUST appear on their OWN separate paragraph, placed AFTER the numbered list ends, with a blank line separating them from the list.
- WRONG: "4. Ammonium Acetate for molecular biology, 98% (SKU: A-00112) Could you please specify which one you are interested in?"
- CORRECT: "4. Ammonium Acetate for molecular biology, 98% (SKU: A-00112)\n\nCould you please specify which one you are interested in? This will help me provide exact inventory details."

ACCESS CONTROL:
- Distributors can access inventory data in addition to orders and invoices.
- Distributors can: track their orders, check order status, view pending orders, view invoices, and check inventory.
- DISTRIBUTOR BASE WAREHOUSE: When the profile context includes base_warehouse_id, product tracking and default stock for that distributor use that ERP warehouse (company allocation). If base_warehouse_id is null, the system may infer a warehouse from stock data.
- "Local warehouse" / "base warehouse" (orders): the shortcut lists orders at the hub location whose **deriveOrderStatusFromERP** is **ORDER_RECEIVED** only (excludes central / factory / invoiced paths). Sub-status column is temporarily fixed text. For full activity use recent/pending orders tools. Do **not** treat "local warehouse" as ALLOCATED_LOCAL_WAREHOUSE unless the user says **allocated local**.
- "Central warehouse" (orders): same table style and **ORDER_RECEIVED-only** filter as local — ERP **BhiwandiDepot** (**Location_id 6**) by default, or **ERP_CENTRAL_WAREHOUSE_LOCATION_ID** if set; candidate orders at that location (header **analysis_id** or line despatch), then keep only **deriveOrderStatusFromERP = ORDER_RECEIVED**. Sub-status column is temporarily fixed text.
- WAREHOUSE USERS: When a warehouse user asks for "inventory", "orders", "my inventory", "my orders", "this warehouse inventory", or "orders under my warehouse", you MUST use their warehouse_id from the profile context. DO NOT ask them to specify a warehouse - use their assigned warehouse_id automatically.
- SUPER ADMIN/DISTRIBUTOR: When super admin or distributor asks for "inventory" or "check inventory" without specifying a warehouse, use getAllInventory to show inventory from all warehouses. If they specify a warehouse name, use searchWarehouseByName first, then getWarehouseInventory.
- INVOICE ACCESS: Super Admin can view all invoices. Company Admin and regular users can only view invoices for their company. Use getInvoiceDetails, getCompanyInvoices, getInvoicesByOrder, or getOrderDrilldown based on the query.

CRITICAL INTELLIGENCE RULES - MAINTAIN CONTEXT AND CHAIN TOOLS:
1. ALWAYS read previous messages and tool results in this conversation. Extract and remember warehouse_id, order_number, company_id from previous tool calls.
2. FOR WAREHOUSE USERS: If user asks for "inventory", "orders", "my inventory", "my orders", "check inventory", "show orders", or similar requests WITHOUT specifying a warehouse name, IMMEDIATELY use the warehouse_id from the user's profile (provided in the system context). Call getWarehouseInventory or getOrdersByWarehouse with that warehouse_id.
3. FOR SUPER ADMIN OR DISTRIBUTOR: If they ask for "inventory" or "check inventory" WITHOUT specifying a warehouse name, call getAllInventory to show inventory from all warehouses. If they specify a warehouse name, call searchWarehouseByName first, then getWarehouseInventory with that warehouse_id.
4. When user mentions a warehouse by NAME (e.g., "Mumbai", "Delhi", "Mumbai West"), IMMEDIATELY call searchWarehouseByName, then use the returned warehouse_id to call getWarehouseInventory (if allowed) or getOrdersByWarehouse in the SAME turn.
5. If searchWarehouseByName returns a single match, use that warehouse_id immediately. If multiple matches, ask user to choose, then use the chosen warehouse_id.
6. When user says "this warehouse", "the warehouse", "orders under this warehouse", or "inventory for this warehouse", look for the most recent warehouse_id from previous tool results OR use the user's profile warehouse_id if they are a warehouse user - DO NOT ask again.
7. COMPLETE THE USER'S REQUEST IN ONE TURN: If warehouse user asks "check inventory" without specifying a warehouse, use their profile warehouse_id directly. If super admin asks "check inventory" without specifying a warehouse, call getAllInventory. If they provide a warehouse name, call searchWarehouseByName first, then getWarehouseInventory.
8. If user asks "orders under this warehouse" or "my orders" after you've identified a warehouse, call getOrdersByWarehouse with the warehouse_id from the previous tool result OR their profile warehouse_id.
9. When returning ANY list (orders, inventory, invoices), YOU MUST FORMAT IT EXCLUSIVELY AS A MARKDOWN TABLE. DO NOT use readable text lists, bullet points, or numbered lists!
10. For orders list responses: use a Markdown Table with columns like Order Number, Status, Order Date, Order Value. Do NOT show customer_name or expected_delivery_date in the readable table.
11. For inventory: use a Markdown Table with columns for Product, SKU, Available Qty, Warehouse. For general warehouse listings (listing all stock), show only top 5 items by default. HOWEVER, for specific product searches (tracking a product), you MUST search all data and show the exact availability regardless of quantity rank.
32. NEVER output raw JSON arrays directly for these lists.
33. PRODUCT SEARCH VS LISTING: If a user asks a general question like "what is in this warehouse", use getWarehouseInventory (shows top items). If they ask about a SPECIFIC product (name or SKU), you MUST use getProductTrackingAndInventory to search the entire database.

QUERY RULES:
- **ORDER ID SOURCE (ERP ONLY — NO HALLUCINATION):** For **getOrderStatus** / **getOrderDrilldown**, pass an order identifier **only from the current user message** (ERP voucher, numeric sales_order_id, or text after "order …"). **Do not** pull an order number from earlier chat unless the user clearly means the same order ("that order", "it", "the same one") **without** typing a new id. If the tool returns **not found** or **error**, say that — **never** substitute another order or invent data.
- **ERP number shapes:** Sales **orders** use voucher series **105** in the second segment (e.g. **8.105.260218.39**). Tax **invoices** use series **106** (e.g. **8.106.0.52690**). If the user says "order" or "track order" but the number contains **.106.**, they are referring to an **invoice** — use **getInvoiceDetails**, not getOrderStatus.
- **"What should I do next" / "next step"** when an **order** number (8.105...) is present: call **getOrderStatus** only. If **lane_a.external_status** is **DELIVERED**, say there is **no operational next step** (do **not** run product or inventory tools). Otherwise summarize **lane_a** next_action / explanation.
- "my distributors", "list distributors", "show distributors", "company list" (for super admin): use getDistributors
- "search for distributor <name>", "find distributor <name>", "extract distributor <name>" (for super admin): use searchDistributors
- SUPER ADMIN: "orders under <distributor name>" / "distributor orders for <name>": use getDistributorOrdersByName
- When listing warehouses (getAllWarehouses/searchWarehouseByName), only use 'warehouse_name' and 'location' from the tool result. Do not invent GSTIN, district, or other fields.
- Track order / order status / "details of this order" / ERP numbers like 6.105.260218.2 / minimal numeric IDs like 830401: use **getOrderStatus** first (or **getOrderDrilldown** when the user explicitly wants **line items / lines / drilldown / products**). In replies say **order** or **sales order**, not invoice.
- **Do not paste the same long answer for every phrasing:** If the user asks only for **status / track / where is** (no words like **line, lines, items, products, drilldown, SKU**): use **getOrderStatus**, give **short** order summary + **Lane A** bullets + invoice count; **do not** print the full numbered **Items in the Order** list—only a one-liner (e.g. "4 line items — ask to show line items for the full list"). If they ask for **lines / items / drilldown**, then include the full line-item list (getOrderDrilldown or getOrderStatus with items).
- If the **previous message** already showed line items and the user asks for **status** or a short follow-up, reply with **status + Lane A only** without re-pasting the entire line-item table.
- **DEMO / 7-STATE TESTING:** Use **getDemoOrder** ONLY when the user explicitly asks for a demo/sample/mock/simulation (e.g. includes words like "demo", "sample", "mock", "simulate"). If they ask for real orders by status, NEVER use demo tools.
- For numeric-only user input (digits only), first try **getOrderStatus**. If not found, then consider invoice tools.
- Tax invoice by invoice number (user explicitly says invoice): use getInvoiceDetails
- "My invoices" or "today's invoices": use getCompanyInvoices (with dateFilter: "today" for today)
- Product tracking: for "Where is <product>?" or "Is <product> available?/stock available?" use getProductTrackingAndInventory
- **DEEP SUPPLY VISIBILITY:** If a user asks about product availability and the stock is 0 OR they ask "why" it's out of stock, "when" it will be back, or "how much time it will take", OR they see an order is **Awaiting Factory** and want more details, YOU MUST call **getProductSupplyStatus**. This tool explains the internal factory/purchase state (requisitions, BOMs, raw materials).
- If tool result includes document_type "erp_sales_order", follow assistant_reply_rules in that result.
- If **getOrderStatus** or **getOrderDrilldown** (ERP sales order) tool result includes \`lane_a\`, you MUST surface it in readable bullets (do not omit):
  - One line from \`lane_a.explanation\` (plain status meaning).
  - **Indicative expected delivery:** \`lane_a.expected_delivery_band.label\` — state it is indicative, not a guaranteed delivery date. **If \`lane_a.external_status\` is DELIVERED**, say upcoming estimated delivery is **not applicable** (order completed); do **not** describe an estimated delivery window as a future delivery promise.
- **Next update by:** \`lane_a.next_update_by\` (ISO date) or say it does not apply if null (e.g. delivered).
- **Suggested next step:** map \`lane_a.next_action\` to user words: wait | raise UDR | request transfer | escalate — plus a short phrase from \`lane_a.next_action_reason\`. **If \`lane_a.external_status\` is DELIVERED, do not show any "Suggested next step" text** (the order is completed).
- Do NOT output raw JSON in assistant replies. Present user-visible data as plain text and markdown tables only.

ORDER THREAD SAFEGUARD (conversation memory):
- Read prior turns in this chat. If the **previous user message** was clearly about an **order** (e.g. "track my order", "order status", "details of this order", "show order", or a message that was **only** an ERP-style order number like 6.105.260218.2), the **current** turn continues in **ORDER context**.
- In that situation, **do not** call **getInvoiceDetails**, **getInvoiceStatus**, **getCompanyInvoices**, or **getDelayedInvoices** unless the **current** user message **explicitly** asks for an **invoice** (words like: invoice, tax invoice, billing, bill, GST invoice, "my invoices", "list invoices").
- For follow-ups like "more details", "show items", "what about line 3", keep using **getOrderStatus** or **getOrderDrilldown** with the same order number from context.
- **getInvoicesByOrder** is only for when the user explicitly wants **invoices linked to** an order (they mention invoices + order).

CRITICAL INSTRUCTION FOR ALL LISTS (PRODUCTS, INVOICES, ORDERS, etc):
- ALWAYS use a clean Markdown Table (format: \`| Header1 | Header2 |\`) when you are displaying a list of items, invoices, or orders. DO NOT use bullet points or numbered text lines for these lists!
- ABSOLUTELY DO NOT print line items or products yourself. Whether the user asks for details, status, lines, items, or products, DO NOT output the product list in your text. The system will AUTOMATICALLY construct and append a proper markdown table of products, so you just need to give a short introduction snippet summarizing the order and stop.

9. CONVERSATIONAL STYLE & FLOW:
    - ALWAYS start your response with a clear, friendly conversational sentence identifying what you've found BEFORE showing any data or Quick View. Examples: "I found the product — here's what we have in stock for **Ammonium Sulphite**.", "I've located the details for your order, here's the current status.", "Here's what I found for **Sodium Chloride** across your warehouses."
    - After the intro line, add 1–2 short natural follow-on lines that feel conversational and relevant (e.g. summarise key info, flag something noteworthy, or invite a follow-up). Keep it warm but concise.
    - ALWAYS end your response with a helpful closing question to keep the conversation going (e.g., "Let me know if you want to check the status of another order or if there is anything else I can assist with!").
    - Maintain a professional yet helpful "concierge" tone.

SPELL CORRECTION — CRITICAL:
    - If the user's input contains a likely misspelling or typo (e.g. "ammoniumm suluuphite", "sodiim cloride", "sulphate" vs "sulphite"), you MUST acknowledge this at the very start of your response using natural, friendly phrasing. Do NOT silently correct and move on.
    - Use phrases like: "It looks like you may have meant **Ammonium Sulphite** — did you mean that?", "Just checking — did you mean **Sodium Chloride**? I've gone ahead and searched for that.", "I noticed a possible typo in your query — I've searched for **Ammonium Sulphite** which seems closest to what you typed.", or "Are you looking for **Ammonium Sulphite**? I've found some matching results below."
    - If the tool returns "product_candidates" (a list of possible matches), list them clearly and ask the user to confirm which one they meant: "I found a few possible matches — could you clarify which one you're looking for?"
    - If the tool found a close fuzzy match, tell the user what you searched for: "I searched for **Ammonium Sulphite** based on your query — here's what I found."
    - Never silently ignore a typo. Always surface the correction in a conversational, non-condescending way.

RESPONSE FORMAT:
- For **order** list markdown tables (recent / by status / distributor / delayed / dispatch): put up to **20** rows in the table when the tool has them. Do **not** say how many orders matched in the opening sentence (avoid "I found 42 orders" or "showing 5 of …"); describe scope only, e.g. "Here are your delivered orders."
- Treat "pending orders" as **all non-delivered active orders** (not a literal ERP "PENDING" state label). Exclude delivered/cancelled/closed.
- For other non-card lists (e.g. broad inventory skim), show about **5** rows unless the user asked for a specific product (then show full relevant matches).
- For invoice_card and product_card, render full card contents (no item truncation in the UI card).
- Never include json code blocks in the final answer.
- Keep responses concise but conversational
- Use tool results as ground truth
- Respect role-based access
- Never ask for info you already have
- Understand mixed-language user queries (Hindi/Marathi + English terms) and map them to the same operational intent handling.
- For order responses, ALWAYS print: "Linked invoices: <invoice_count>" using the exact numeric value from tool result.
- Never guess or manually recount invoices from prose.
- If invoices are listed, list exactly up to \`invoice_count\` entries and keep numbering consistent (1..N).
- If \`invoice_count\` is 0, explicitly write: "Linked invoices: 0".
- If order tool result includes \`order_value_display\`, prefer that label over \`order_value\` in readable text (e.g., "N/A (Stock Transfer)").
- Keep wording user-friendly and plain, with short bullets and clear labels.`;

const SAFE_FALLBACK_REPLY =
  "I could not complete that safely right now. Please retry with the exact order, invoice, or product ID.";
const ORDER_LINES_NOT_POSTED_REPLY = "Order exists but lines are not posted in ERP yet.";

function ensureSafeReply(raw: unknown, fallback = SAFE_FALLBACK_REPLY): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return fallback;
  if (text === "{}" || text === "[]") return fallback;
  return text;
}

function extractErpVoucherTokens(text: string): string[] {
  const out: string[] = [];
  const re = /\b(\d+\.\d+\.\d+\.\d+(?:\.\d+)?)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return Array.from(new Set(out));
}

/** ERP internal sales_order_id often appears as a bare 5–9 digit number (e.g. 830138). Excludes 10-digit phone numbers. */
function extractBareNumericSalesOrderIds(text: string): string[] {
  const re = /\b(\d{5,9})\b/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return Array.from(new Set(out));
}

function extractOrderLookupTokensFromText(text: string): string[] {
  const vouchers = extractErpVoucherTokens(text);
  const nums = extractBareNumericSalesOrderIds(text);
  return [...vouchers, ...nums];
}

/**
 * Captures order id the user typed in *this* message (e.g. "Where is order ABC123" → ABC123).
 * Does not use chat history — prevents substituting a previous order when the new id is missing/malformed.
 */
function extractExplicitOrderRefFromMessage(text: string): string | null {
  const clean = String(text ?? "").trim();
  const patterns: RegExp[] = [
    /\bwhere\s+is\s+(?:my\s+)?order\s+([^\s,]+)/i,
    /\bstatus\s+of\s+order\s+([^\s,]+)/i,
    /\bwhen\s+will\s+my\s+order\s+([^\s,]+)\b/i,
    /\btrack\s+(?:my\s+)?order\s+([^\s,]+)/i,
    /\bwhat\s+should\s+i\s+do\s+(?:now\s+)?for\s+order\s+([^\s,]+)/i,
    /\bshould\s+i\s+wait\s+or\s+escalate\s+order\s+([^\s,]+)/i,
  ];
  for (const re of patterns) {
    const m = clean.match(re);
    if (m?.[1]) {
      const tok = m[1].replace(/[.,;:!?)]+$/g, "").trim();
      if (tok && !/^(my|the|a|an|from|for|last|next|this|that)$/i.test(tok)) return tok;
    }
  }
  return null;
}

/** Single primary order token from the current user message only (never from history). */
function extractPrimaryOrderTokenFromCurrentMessageOnly(text: string): string | null {
  const vouchers = extractErpVoucherTokens(text);
  if (vouchers.length) return vouchers[0];
  const nums = extractBareNumericSalesOrderIds(text);
  if (nums.length) return nums[0];
  const explicit = extractExplicitOrderRefFromMessage(text);
  if (explicit) return explicit;
  /** Numeric id after "order" when fewer than 5 digits (not matched by extractBareNumericSalesOrderIds alone) */
  const labeledNum = /\border\s+(\d{3,9})\b/i.exec(text);
  if (labeledNum?.[1]) return labeledNum[1];
  return null;
}

/**
 * Lightweight multilingual intent normalization for chat routing.
 * Maps common Hindi/Marathi mixed tokens to equivalent English intent words.
 */
function normalizeUserTextForIntent(message: string): string {
  let t = String(message ?? "").toLowerCase();
  const replacements: Array<[RegExp, string]> = [
    [/\b(ऑर्डर|आर्डर|order|orders)\b/gi, " orders "],
    [/\b(इनवॉइस|invoice|bill|billing)\b/gi, " invoice "],
    [/\b(लिस्ट|list|दिखाओ|dikhao|dikhaiye|dakhva|dakva|show)\b/gi, " show "],
    [/\b(डिलिवर|delivered|delivery)\b/gi, " delivered "],
    [/\b(पेंडिंग|pending)\b/gi, " pending "],
    [/\b(लेट|देर|delayed|overdue)\b/gi, " delayed "],
    [/\b(ट्रांसपोर्ट|transport)\b/gi, " transport "],
  ];
  for (const [re, to] of replacements) t = t.replace(re, to);
  return t.replace(/\s+/g, " ").trim();
}

function isVagueMyOrdersIntent(message: string): boolean {
  const t = normalizeUserTextForIntent(message);
  if (/invoice|product\s+x\b|warehouse|inventory|stock|sku/.test(t)) return false;
  if (extractPrimaryOrderTokenFromCurrentMessageOnly(message)) return false;
  if (/\b(status|track|where\s+is|delivery|delivered|expected|dispatch|pending)\b/.test(t)) return false;
  const asksForOrders = /\borders?\b/.test(t);
  if (!asksForOrders) return false;
  const asksAllOrders = /\b(all|entire|complete)\b/.test(t);
  const asksOwnedOrders = /\b(my|mine|i)\b/.test(t);
  const asksChronologicalList =
    /\b(recent|latest|newest|last)\b/.test(t) ||
    /\bplaced\s+something\s+recently\b/.test(t);

  return (
    asksAllOrders ||
    asksChronologicalList ||
    /^check\s+my\s+orders?\s*$/i.test(t) ||
    /^show\s+me\s+orders?\s*$/i.test(t) ||
    /^show\s+my\s+orders?\s*$/i.test(t) ||
    /^my\s+orders?\s*$/i.test(t) ||
    /^i\s+placed\s+something\s+recently\s*$/i.test(t) ||
    (asksOwnedOrders && asksForOrders)
  );
}

function isAllOrdersIntent(message: string): boolean {
  const t = normalizeUserTextForIntent(message);
  if (/invoice|warehouse|inventory|stock|sku|product/.test(t)) return false;
  return /^show\s+all\s+orders?\s*$/i.test(t) || /^all\s+orders?\s*$/i.test(t);
}

function isCentralWarehouseOrdersIntent(message: string): boolean {
  const t = String(message ?? "").trim().toLowerCase();
  const asksForOrders = /\border(s)?\b/.test(t);
  const centralWarehouse = /\bcentral\s+ware\s*house\b|\bcentral\s+warehouse\b/.test(t);
  /** Bhiwandi depot is the default central `Location_id` in ERP for this tenant. */
  const bhiwandiCentral = /\bbhiwandi\b/.test(t);
  return asksForOrders && (centralWarehouse || bhiwandiCentral);
}

function isMyCentralWarehouseQuery(message: string): boolean {
  const t = String(message ?? "").trim().toLowerCase();
  return (
    /\b(which|what)\b.*\b(my)\b.*\bcentral\s+ware\s*house|central\s+warehouse\b/.test(t) ||
    /\bmy\s+central\s+ware\s*house\b|\bmy\s+central\s+warehouse\b/.test(t)
  );
}

async function resolveCentralWarehouseForProfile(
  _profile: UserProfile,
): Promise<{ warehouseId: number | null; warehouseName: string | null }> {
  const envRaw = process.env.ERP_CENTRAL_WAREHOUSE_LOCATION_ID;
  const envId = envRaw != null && String(envRaw).trim() !== "" ? Number(envRaw) : NaN;
  const centralId =
    Number.isFinite(envId) && envId > 0 ? envId : DEFAULT_ERP_CENTRAL_WAREHOUSE_LOCATION_ID;
  const warehouseName = await resolveWarehouseNameByIdFromSql(centralId);
  return { warehouseId: centralId, warehouseName };
}

async function resolveLocalWarehouseForProfile(
  profile: UserProfile,
): Promise<{ warehouseId: number | null; warehouseName: string | null }> {
  if (profile.role === "warehouse") {
    const warehouseId = profile.warehouse_id ?? null;
    if (warehouseId == null) return { warehouseId: null, warehouseName: null };
    const warehouseName = await resolveWarehouseNameByIdFromSql(warehouseId);
    return { warehouseId, warehouseName };
  }

  if (profile.role === "distributor") {
    const accountIds = Array.isArray(profile.erp_account_ids) && profile.erp_account_ids.length
      ? profile.erp_account_ids
      : profile.erp_account_id != null
        ? [profile.erp_account_id]
        : [];
    const sanitized = accountIds
      .map((id) => Number(id))
      .filter((n) => Number.isFinite(n) && n > 0)
      .map((n) => Math.trunc(n));
    if (sanitized.length) {
      const inList = sanitized.join(",");
      const { data, error } = await querySqlServer<{ analysis_id: number | null; cnt: number }>(
        `SELECT TOP 1 h.analysis_id, COUNT(1) AS cnt
         FROM dbo.sales_order_header h
         WHERE h.account_id IN (${inList})
           AND h.analysis_id IS NOT NULL
         GROUP BY h.analysis_id
         ORDER BY cnt DESC, h.analysis_id ASC`,
      );
      if (!error && data?.length) {
        const localId = Number(data[0].analysis_id);
        if (Number.isFinite(localId) && localId > 0) {
          const warehouseName = await resolveWarehouseNameByIdFromSql(localId);
          return { warehouseId: localId, warehouseName };
        }
      }
    }
  }

  const warehouseId = profile.base_warehouse_id ?? profile.warehouse_id ?? null;
  if (warehouseId == null) return { warehouseId: null, warehouseName: null };
  const warehouseName = await resolveWarehouseNameByIdFromSql(warehouseId);
  return { warehouseId, warehouseName };
}

function formatOrdersTable(orders: Array<Record<string, unknown>>): string {
  const rows = orders.slice(0, CHAT_ORDER_LIST_TABLE_MAX);
  const header = "| Order Number | Status | Warehouse |";
  const sep = "|---|---|---|";
  const body = rows
    .map((o) => {
      const orderNo = String(o.order_number ?? o.orderNumber ?? "N/A");
      const status = String(o.status ?? o.order_status ?? "N/A");
      const wh = String(o.warehouse_name ?? o.warehouseName ?? "N/A");
      return `| ${orderNo} | ${status} | ${wh} |`;
    })
    .join("\n");
  return `${header}\n${sep}\n${body}`;
}

function dedupeOrdersByNumber<T extends { order_number?: unknown; orderNumber?: unknown }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const key = String(r?.order_number ?? r?.orderNumber ?? "").trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

async function resolveWarehouseNameByIdFromSql(
  warehouseId: number,
): Promise<string | null> {
  if (!Number.isFinite(warehouseId) || warehouseId <= 0) return null;
  const { data, error } = await querySqlServer<{ Location_id: number; Description: string | null; Address: string | null }>(
    `SELECT TOP 1 Location_id, Description, Address
     FROM dbo.Location
     WHERE Location_id = @id`,
    { id: warehouseId },
  );
  if (error || !data?.length) return null;
  const name = String(data[0].Description ?? "").trim();
  const address = String(data[0].Address ?? "").trim();
  if (!name) return null;
  if (/mumbai/i.test(address) && !/mumbai/i.test(name)) {
    return `${name}, Mumbai`;
  }
  return name;
}

async function resolveWarehouseDetailsByIdFromSql(
  warehouseId: number,
): Promise<{ name: string | null; location: string | null }> {
  if (!Number.isFinite(warehouseId) || warehouseId <= 0) return { name: null, location: null };
  const { data, error } = await querySqlServer<{ Description: string | null; Address: string | null }>(
    `SELECT TOP 1 Description, Address
     FROM dbo.Location
     WHERE Location_id = @id`,
    { id: warehouseId },
  );
  if (error || !data?.length) return { name: null, location: null };
  const name = String(data[0].Description ?? "").trim() || null;
  const address = String(data[0].Address ?? "").trim();
  let location: string | null = null;
  if (/mumbai/i.test(address)) location = "Mumbai";
  else if (/delhi/i.test(address)) location = "Delhi";
  else if (/hyderabad/i.test(address)) location = "Hyderabad";
  else if (/chennai/i.test(address)) location = "Chennai";
  else if (/kolkata/i.test(address)) location = "Kolkata";
  return { name, location };
}

function isProductXPlaceholderQuery(message: string): boolean {
  const t = message.trim().toLowerCase();
  return (
    /^do\s+you\s+have\s+product\s+x\b/.test(t) ||
    /^where\s+is\s+product\s+x\b/.test(t) ||
    /^which\s+warehouse\s+has\s+product\s+x\b/.test(t)
  );
}

function wantsDeterministicOrderLookup(userMessage: string, orderToken: string | null): boolean {
  if (!orderToken) return false;
  if (looksLikeErpInvoiceVoucherNumber(orderToken)) return false;
  const u = userMessage.toLowerCase();
  return (
    /\bwhere\s+is\s+(?:my\s+)?order\b/.test(u) ||
    /\bstatus\s+of\s+order\b/.test(u) ||
    /\bwhen\s+will\s+my\s+order\b/.test(u) ||
    /\btrack\s+(?:my\s+)?order\b/.test(u) ||
    (/\border\b/.test(u) && /\b(arrive|arriving|delivery|delivered|expected|status)\b/.test(u))
  );
}

function nextStepOrEscalationIntent(userMessage: string): boolean {
  return /what\s+(?:should|can)\s+i\s+do|next\s+step|what\s+to\s+do\s+now|what\s+do\s+i\s+do\s+now|should\s+i\s+wait|escalate|wait\s+or\s+escalate/i.test(
    userMessage,
  );
}

function asksForOrderLineItems(userMessage: string): boolean {
  return /\b(line|lines|line\s*items|items|products|drilldown|detail(?:ed)?|full\s+details?)\b/i.test(
    userMessage,
  );
}

function isExplicitOrderLookupIntent(userMessage: string): boolean {
  const u = String(userMessage ?? "").toLowerCase();
  return (
    /\border\b/.test(u) ||
    /\btrack\b/.test(u) ||
    /\bstatus\b/.test(u) ||
    /\bwhere\s+is\b/.test(u) ||
    /\bshow\b/.test(u) ||
    /\bcheck\b/.test(u) ||
    /\bdetail/.test(u)
  );
}

/** Non-admin users must not browse other distributors' orders via chat. */
function isCrossDistributorDataIntent(message: string): boolean {
  const t = message.trim().toLowerCase();
  return (
    /\b(another|other)\s+distributor\b/.test(t) ||
    /\bshow\s+another\s+distributor\b/.test(t) ||
    /\banother\s+distributor\s+order\b/.test(t) ||
    /\border\s+from\s+another\s+distributor\b/.test(t)
  );
}

function formatInvoiceOrderMislabelReply(voucher: string, inv: unknown): string {
  const rec = inv as { error?: string; invoice_card?: Array<Record<string, unknown>> };
  if (rec?.error) return String(rec.error);
  const card = rec?.invoice_card?.[0] as Record<string, unknown> | undefined;
  if (!card) return `Loaded invoice **${voucher}**.`;

  const amt = card.invoice_total_amount;
  const date = card.invoice_date;
  const cust = card.customer_full_name;
  const removalDate = card.date_of_removal;
  const transportName = card.transport_name;
  const vehicleNo = card.vehicle_number;
  const confirmed = card.confirmed;

  const amtStr = formatINR(amt as number | null);

  let reply =
    `${voucher} is a tax invoice voucher (ERP uses series 106 in the second segment). Sales orders use series 105 (for example 8.105.…).\n\n` +
    `Here is this invoice:\n\n` +
    `| Field | Value |\n|---|---|\n` +
    `| Invoice number | ${voucher} |\n` +
    `| Invoice date | ${formatDateYmd(date)} |\n` +
    `| Distributor | ${String(cust ?? "N/A")} |\n` +
    `| Status | ${confirmed ? "Confirmed" : "Draft / Pending"} |\n` +
    `| Total | ${amtStr} |\n`;

  if (removalDate) {
    reply += `| Delivered on | ${formatDateYmd(removalDate)} |\n`;
  }
  if (transportName || vehicleNo) {
    const transport =
      transportName && vehicleNo
        ? `${String(transportName)} (${String(vehicleNo)})`
        : String(transportName || vehicleNo);
    reply += `| Transport | ${transport} |\n`;
  }

  reply +=
    `\nIf you need the related sales order, open the linked order from this invoice or ask for an order number that contains 105 in the second segment.`;

  return reply;
}

function formatNextStepOrderReply(voucher: string, orderRes: unknown): string {
  const r = orderRes as {
    error?: string;
    lane_a?: { external_status?: string; explanation?: string; next_action_reason?: string };
  };
  if (r?.error) return String(r.error);
  const st = String(r.lane_a?.external_status ?? "");
  if (st === "DELIVERED") {
    return (
      `For order ${voucher}, ERP shows Delivered — the order is complete. There is no further operational next step unless you need proof of delivery or must raise a delivery dispute.\n\n` +
        `Tell me if you want to check another order, an invoice, or inventory.`
    );
  }
  const expl = String(r.lane_a?.explanation ?? "").trim();
  const reason = String(r.lane_a?.next_action_reason ?? "Follow the latest status in ERP.").trim();
  return (
    `What to do next for order ${voucher}:\n\n` +
      (expl ? `${expl}\n\n` : "") +
      `Suggested next step: ${reason}`
  );
}

/** "When did I last order <product>?" — product query only, ends at punctuation. */
function parseWhenLastOrderedProductIntent(message: string): { productQuery: string } | null {
  const clean = String(message ?? "").trim();
  const m = /^when\s+did\s+i\s+last\s+order(?:ed)?\s+([\s\S]+?)\s*$/i.exec(clean);
  if (!m) return null;
  const productQuery = String(m[1] ?? "")
    .trim()
    .replace(/[?.!]+$/g, "")
    .trim();
  if (productQuery.length < 2) return null;
  return { productQuery };
}

function formatWhenLastOrderedProse(card: Record<string, unknown> | null | undefined, fallbackName: string): string {
  if (!card || typeof card !== "object") {
    return `I couldn't load order history for **${fallbackName}**.`;
  }
  const product = card.product as Record<string, unknown> | undefined;
  const name = String(product?.product_name ?? product?.sku ?? fallbackName);
  const oh = card.order_history as Record<string, unknown> | undefined;
  const last = oh?.last_order_date as string | null | undefined;
  const latest = Array.isArray(oh?.latest_orders) ? (oh.latest_orders as Array<{ order_date?: string | null }>) : [];
  const firstDate = latest[0]?.order_date;
  const dateStr =
    last && String(last).trim()
      ? String(last).slice(0, 10)
      : firstDate
        ? String(firstDate).slice(0, 10)
        : null;
  if (dateStr) {
    return `**Last order for ${name}:** ${dateStr}\n\nOrder history and stock are shown in the card below.`;
  }
  return `No prior orders found for **${name}** in your accessible history. Availability is shown in the card below if applicable.`;
}

export async function POST(request: Request) {
  try {
    const { profile, userId } = await resolveUserContext(request);
    const { message } = (await request.json()) as { message: string };
    const userMessage = String(message ?? "").trim();
    const apiKey = normalizeApiKey(process.env.OPENAI_API_KEY);
    const openai = getOpenAIClient(apiKey);
    const supabase = createSupabaseAdminClient();
    const sessionId = await ensureChatSession(supabase, userId);

    // Each DB row is one turn: `message` = user text, `response` = assistant (sender is often "assistant" on insert).
    const { data: history } = await supabase
      .from("chatbot_messages")
      .select("message,response,sender")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(20);

    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `${SYSTEM_PROMPT}\nCurrent role: ${profile.role}, company_id: ${profile.company_id ?? "null"}, warehouse_id: ${profile.warehouse_id ?? "null"}, base_warehouse_id (company default for distributors): ${profile.base_warehouse_id ?? "null"}`,
      },
    ];

    if (history && history.length > 0) {
      const reversedHistory = [...history].reverse();
      for (const h of reversedHistory) {
        const userText = (h.message ?? "").trim();
        const assistantText = (h.response ?? "").trim();
        // Replay full turns: user then assistant (matches how rows are stored).
        if (userText) {
          messages.push({ role: "user", content: userText });
        }
        if (assistantText) {
          messages.push({ role: "assistant", content: assistantText });
        }
      }
    }
    messages.push({ role: "user", content: userMessage });

    const lowerMessage = userMessage.toLowerCase();
    const normalizedUserText = normalizeUserTextForIntent(userMessage);
    const userMentionsInvoices = /\binvoices?\b/.test(normalizedUserText);
    const looksLikeOffTopicQuery = isOffTopicQuery(lowerMessage);

    const appendFollowUp = (reply: string): string => {
      const cleaned = String(reply ?? "").trim();
      if (!cleaned) return cleaned;
      const tail =
        "If you'd like, I can also check another warehouse, distributor, product, or order for you.";
      return cleaned.endsWith(tail) ? cleaned : `${cleaned}\n\n${tail}`;
    };

    const sendAssistantResponse = async (reply: string) => {
      const finalReply = appendFollowUp(reply);
      await supabase
        .from("chatbot_messages")
        .insert({
          session_id: sessionId,
          user_id: userId,
          role: profile.role,
          sender: "assistant",
          message: userMessage,
          response: finalReply,
        });
      return new Response(finalReply, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    };

    if (looksLikeOffTopicQuery) {
      const scopedReply =
        "I can only help with SRL operations workflows: orders, invoices, inventory, dispatch, products, and warehouses. Please ask an SRL-related query like `track order 6.105.260216.1` or `show available stock for Evans Blue`.";
      return sendAssistantResponse(scopedReply);
    }

    if ((profile.role === "distributor" || profile.role === "super_admin") && isHomeWarehouseQuery(lowerMessage)) {
      const localWarehouse = await resolveLocalWarehouseForProfile(profile);
      const resolvedHomeWarehouseId = localWarehouse.warehouseId;
      const details =
        resolvedHomeWarehouseId != null
          ? await resolveWarehouseDetailsByIdFromSql(resolvedHomeWarehouseId)
          : { name: null, location: null };
      const displayName = details.name ?? localWarehouse.warehouseName ?? null;
      const locationSuffix = details.location ? `, ${details.location}` : "";
      const homeWarehouseReply =
        profile.role === "super_admin"
          ? resolvedHomeWarehouseId == null
            ? "Super Admin does not require a fixed local warehouse. You can ask for a specific warehouse by name (for example: 'orders in Mumbai warehouse')."
            : `Local warehouse context: ${displayName ?? "Warehouse"} (ID: ${resolvedHomeWarehouseId}${locationSuffix}). As Super Admin, you can query any warehouse by name.`
          : resolvedHomeWarehouseId == null
            ? "I could not find a mapped home warehouse for your profile yet.\n\nPlease ask your administrator to configure your company base warehouse mapping, and then I can immediately show warehouse-specific orders and inventory."
          : `Your local warehouse is ${displayName ?? "Warehouse"} (ID: ${resolvedHomeWarehouseId}${locationSuffix}). I can also show orders and inventory for this warehouse.`;
      return sendAssistantResponse(homeWarehouseReply);
    }

    if (isCentralWarehouseOrdersIntent(userMessage)) {
      const centralWhReply = await formatCentralWarehouseOrdersReply(profile);
      return sendAssistantResponse(centralWhReply);
    }

    if (isMyCentralWarehouseQuery(userMessage) && (profile.role === "distributor" || profile.role === "super_admin")) {
      const resolvedCentral = await resolveCentralWarehouseForProfile(profile);
      const details =
        resolvedCentral.warehouseId != null
          ? await resolveWarehouseDetailsByIdFromSql(resolvedCentral.warehouseId)
          : { name: null, location: null };
      const displayName = details.name ?? resolvedCentral.warehouseName ?? "Warehouse";
      const locationSuffix = details.location ? `, ${details.location}` : "";
      const myCentralReply =
        resolvedCentral.warehouseId == null
          ? "I could not find your central warehouse mapping yet.\n\nPlease ask admin to configure the company base warehouse mapping, and then I can use it automatically for order and inventory queries."
          : `Your central warehouse is ${displayName} (ID: ${resolvedCentral.warehouseId}${locationSuffix}).`;
      return sendAssistantResponse(myCentralReply);
    }

    if (profile.role !== "super_admin" && isCrossDistributorDataIntent(userMessage)) {
      const denied =
        "You are not authorized to view other distributor data.";
      return sendAssistantResponse(denied);
    }

    if (isProductXPlaceholderQuery(userMessage)) {
      const placeholderReply =
        "Please give the **exact product name** or **SKU** you want to check. I can then query live ERP stock by warehouse.";
      return sendAssistantResponse(placeholderReply);
    }

    if (/^when\s+did\s+i\s+last\s+order\s+this\s+product\s*$/i.test(userMessage.trim())) {
      const needProductReply =
        "Please tell me the **product name** or **SKU** you mean (or paste it from a line item). I will look up your recent order quantities from ERP.";
      return sendAssistantResponse(needProductReply);
    }

    if ((profile.role === "distributor" || profile.role === "super_admin") && isDistributorListIntent(userMessage)) {
      const searchIntent = parseDistributorSearchIntent(userMessage);
      if (profile.role === "super_admin" && searchIntent) {
        const distributorRes = await executeTool("searchDistributors", { search: searchIntent.search }, profile);
        const distributorReply = formatDistributorSearchReply(distributorRes);
        return sendAssistantResponse(distributorReply);
      }

      const distributorRes = await executeTool("getDistributors", { limit: 100 }, profile);
      const distributorReply = formatDistributorListReply(distributorRes);
      return sendAssistantResponse(distributorReply);
    }

    if (isVagueMyOrdersIntent(userMessage)) {
      try {
        const scopedOrders = await getOrdersForRole(profile);
        const allOrders = isAllOrdersIntent(userMessage);
        const vagueReply = formatVagueRecentOrdersReply(scopedOrders, userMessage, profile, allOrders);
        return sendAssistantResponse(vagueReply);
      } catch (vagueErr) {
        console.error("Vague orders handler failed:", vagueErr);
      }
    }

    const whenLastOrderedIntent = parseWhenLastOrderedProductIntent(userMessage);
    if (whenLastOrderedIntent) {
      const toolRes = (await executeTool(
        "getProductTrackingAndInventory",
        { productQuery: whenLastOrderedIntent.productQuery, includeOtherWarehouses: 0 },
        profile,
      )) as {
        error?: string;
        product_card?: Record<string, unknown>;
        message?: string;
        product_candidates?: Array<{ product_id?: number; sku?: string | null; product_name?: string | null }>;
      };
      if (toolRes.error) {
        const errReply = String(toolRes.error);
        return sendAssistantResponse(errReply);
      }
      if (Array.isArray(toolRes.product_candidates) && toolRes.product_candidates.length) {
        const rows = toolRes.product_candidates
          .slice(0, 5)
          .map((c, idx) => `| ${idx + 1} | ${String(c?.product_name ?? "N/A")} | ${String(c?.sku ?? "N/A")} |`)
          .join("\n");
        const clarify =
          `I found multiple products matching "${whenLastOrderedIntent.productQuery}". Which one do you mean?\n\n` +
          `| # | Product | SKU |\n|---|---|---|\n${rows}`;
        return sendAssistantResponse(clarify);
      }
      const prose = formatWhenLastOrderedProse(toolRes.product_card, whenLastOrderedIntent.productQuery);
      const deterministicReply = appendProductCardJsonBlockIfMissing(prose, toolRes.product_card ?? null);
      return sendAssistantResponse(deterministicReply);
    }

    const productOrderHistoryIntent = parseProductOrderHistoryIntent(userMessage);
    if (productOrderHistoryIntent) {
      const toolRes = await executeTool(
        "getProductOrderedQuantity",
        {
          productQuery: productOrderHistoryIntent.productQuery,
          months: productOrderHistoryIntent.months,
        },
        profile,
      );
      const deterministicReply = formatProductOrderHistoryReply(toolRes, productOrderHistoryIntent.months);
      return sendAssistantResponse(deterministicReply);
    }

    // Hard guardrail: if user typed an explicit order id in this message, use deterministic ERP-only flow.
    // This prevents branch drift across different phrasings and blocks hallucinated substitutions.
    const explicitOrderToken = extractPrimaryOrderTokenFromCurrentMessageOnly(userMessage);
    const explicitInvoicesByOrderIntent = parseInvoicesByOrderIntent(userMessage);
    if (
      explicitOrderToken &&
      !explicitInvoicesByOrderIntent &&
      !userMentionsInvoices &&
      !looksLikeErpInvoiceVoucherNumber(explicitOrderToken) &&
      isExplicitOrderLookupIntent(userMessage)
    ) {
      try {
        const deterministicReply = asksForOrderLineItems(userMessage)
          ? formatDeterministicOrderDrilldownReply(
              explicitOrderToken,
              await executeTool("getOrderDrilldown", { orderNumber: explicitOrderToken }, profile),
            )
          : await formatDeterministicOrderStatusReply(explicitOrderToken, profile);
        return sendAssistantResponse(deterministicReply);
      } catch (explicitOrderError) {
        console.error("Explicit order deterministic handler failed:", explicitOrderError);
      }
    }

    try {
      if (isDispatchQueueIntent(userMessage)) {
        const queueRes = await executeTool("getDispatchQueue", {}, profile);
        const queueRows = Array.isArray((queueRes as any)?.orders)
          ? (queueRes as any).orders
          : Array.isArray(queueRes)
            ? queueRes
            : [];
        if (!queueRows.length) {
          const noneReply =
            "I checked the live ERP dispatch queue and there are no orders in **DISPATCH_READY** at the moment.\n\n" +
            "That usually means either orders are still being prepared, already dispatched, or none are due for dispatch right now.\n\n" +
            "If you want, I can also show pending orders or orders in preparation so you can see what may move into dispatch next.";
          return sendAssistantResponse(noneReply);
        }
        const tableRows = queueRows
          .slice(0, CHAT_ORDER_LIST_TABLE_MAX)
          .map((o: any) => {
            const rawVal = o?.order_value ?? o?.total_amount ?? o?.order_amount ?? o?.Total_Order_Amount ?? null;
            return `| ${String(o?.order_number ?? "N/A")} | ${String(o?.status ?? "DISPATCH_READY")} | ${formatDateYmd(o?.order_date ?? o?.created_at)} | ${formatINR(rawVal)} |`;
          })
          .join("\n");
        const queueReply =
          `Here are orders currently in the **DISPATCH_READY** queue.\n\n` +
          `| Order Number | Status | Order Date | Order Value |\n|---|---|---|---:|\n${tableRows}`;
        return sendAssistantResponse(queueReply);
      }

      if (parseTodayInvoicesIntent(userMessage)) {
        const invoicesRes = await executeTool("getCompanyInvoices", { dateFilter: "today", limit: 10 }, profile);
        let todayInvReply = formatTodayInvoicesReply(invoicesRes);

        const todayInvoices = Array.isArray((invoicesRes as any)?.invoices) ? (invoicesRes as any).invoices : [];
        if (!todayInvoices.length) {
          const latestRes = await executeTool("getCompanyInvoices", { limit: 1 }, profile);
          const latestInvoices = Array.isArray((latestRes as any)?.invoices) ? (latestRes as any).invoices : [];
          const latestDate = latestInvoices[0]?.invoice_date ? formatDateYmd(latestInvoices[0].invoice_date) : null;
          if (latestDate) {
            const latestDateRes = await executeTool(
              "getCompanyInvoices",
              { dateFilter: latestDate, limit: 10 },
              profile,
            );
            todayInvReply = formatInvoicesForSpecificDateReply(latestDateRes, latestDate);
          }
        }

        return sendAssistantResponse(todayInvReply);
      }

      const invoicesByOrderIntent = parseInvoicesByOrderIntent(userMessage);
      if (invoicesByOrderIntent) {
        const reply = await formatInvoicesByOrderDetailedReply(invoicesByOrderIntent.orderNumber, profile);
        return sendAssistantResponse(reply);
      }

      if (parseTodayOrdersIntent(userMessage)) {
        const scopedOrders = await getOrdersForRole(profile);
        const todayReply = formatTodayOrdersReply(Array.isArray(scopedOrders) ? scopedOrders : []);
        return sendAssistantResponse(todayReply);
      }

      if (isWarehouseListIntent(userMessage)) {
        const warehouseRes = await executeTool("getAllWarehouses", {}, profile);
        const warehouseReply = formatWarehouseListReply(warehouseRes);
        return sendAssistantResponse(warehouseReply);
      }

      if (parseLocalWarehouseOrdersIntent(userMessage)) {
        const distributorIntentForLocal =
          profile.role === "super_admin" ? parseDistributorOrdersIntent(userMessage) : null;
        const localWhReply = await formatLocalWarehouseOrdersReply(profile, distributorIntentForLocal?.distributorName ?? null);
        return sendAssistantResponse(localWhReply);
      }

      const deliveredByTransportIntent = parseDeliveredByTransportIntent(userMessage);
      if (deliveredByTransportIntent) {
        const scopedOrders = await getOrdersForRole(profile);
        const delivered = scopedOrders.filter((o: any) => String(o?.status ?? "").toUpperCase() === "DELIVERED");
        const deliveredWithLogistics = await enrichDeliveredOrdersWithLogistics(delivered);
        const filtered = deliveredWithLogistics.filter((o: any) => {
          return transportMatchesQuery(o?.transport_name, deliveredByTransportIntent.transportName);
        });
        const reply = filtered.length
          ? (
              `Here are delivered orders handled by **${deliveredByTransportIntent.transportName}**.\n\n` +
              `| Order Number | Status | Order Date | Order Value | Delivery Date | Transport |\n|---|---|---|---|---|---|\n` +
              filtered
                .slice(0, CHAT_ORDER_LIST_TABLE_MAX)
                .map((o: any) => {
                  const transportName = String(o?.transport_name ?? "").trim();
                  const vehicleNo = String(o?.vehicle_number ?? "").trim();
                  const transport =
                    transportName && vehicleNo
                      ? `${transportName} (${vehicleNo})`
                      : transportName || vehicleNo || "Not recorded in ERP";
                  return `| ${String(o?.order_number ?? "N/A")} | DELIVERED | ${formatDateYmd(o?.created_at)} | ${formatOrderValueForChat(o)} | ${formatDateYmd(o?.delivery_date)} | ${transport} |`;
                })
                .join("\n")
            )
          : `I checked delivered orders and found no transport match for **${deliveredByTransportIntent.transportName}** in your accessible scope.`;
        return sendAssistantResponse(reply);
      }

      const statusListIntent = parseStatusOrderListIntent(userMessage);
      if (statusListIntent) {
        const scopedOrders = await getOrdersForRole(profile, { balanced: false, limit: 5000 });
        const normalized = normalizeStatusFilter(statusListIntent.status);
        const filteredBase =
          normalized === "PENDING"
            ? scopedOrders.filter((o: any) => isActiveNonDeliveredStatus(o?.status))
            : scopedOrders.filter((o: any) => String(o?.status ?? "").toUpperCase() === normalized);
        const filtered =
          normalized === "DELIVERED"
            ? await enrichDeliveredOrdersWithLogistics(filteredBase)
            : filteredBase;
        const statusReply = formatStatusOrderListReply(normalized, filtered);
        return sendAssistantResponse(statusReply);
      }

      if (isPendingOrdersIntent(userMessage)) {
        const scopedOrders = await getOrdersForRole(profile, { balanced: false, limit: 5000 });
        const filtered = scopedOrders.filter((o: any) => isActiveNonDeliveredStatus(o?.status));
        const pendingReply = formatStatusOrderListReply("PENDING", filtered);
        return sendAssistantResponse(pendingReply);
      }

      if (isDelayedOrdersIntent(userMessage)) {
        const delayedRes = await executeTool("getDelayedOrders", {}, profile);
        const delayedRows = Array.isArray((delayedRes as any)?.delayed_orders) ? (delayedRes as any).delayed_orders : [];
        if (!delayedRows.length) {
          const noneReply =
            "I checked your accessible ERP orders and there are no orders currently flagged as delayed.\n\n" +
            "This means no active orders are past their expected delivery timeline right now.\n\n" +
            "If helpful, I can also show pending orders and dispatch-ready orders so you can proactively track what needs attention next.";
          return sendAssistantResponse(noneReply);
        }
        const rows = delayedRows
          .slice(0, CHAT_ORDER_LIST_TABLE_MAX)
          .map((o: any) => {
            const rawVal = o?.order_value ?? o?.total_amount ?? o?.order_amount ?? o?.Total_Order_Amount ?? null;
            const valStr =
              rawVal != null && Number.isFinite(Number(rawVal))
                ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(rawVal))
                : "N/A";
            return `| ${String(o?.order_number ?? "N/A")} | ${String(o?.status ?? "N/A")} | ${formatDateYmd(o?.expected_delivery_date)} | ${String(o?.days_delayed ?? "N/A")} | ${valStr} |`;
          })
          .join("\n");
        const delayedReply =
          `Here are delayed orders in your accessible ERP scope.\n\n` +
          `| Order Number | Status | Expected Delivery | Days Delayed | Order Value |\n|---|---|---|---:|---|\n${rows}`;
        return sendAssistantResponse(delayedReply);
      }

      const distributorWarehouseIntent = parseDistributorWarehouseIntent(userMessage);
      if (profile.role === "super_admin" && distributorWarehouseIntent) {
        let distributorName = distributorWarehouseIntent.distributorName;
        let resolved = await resolveWarehouseForDistributorNameFromSql(distributorName);
        if (resolved.warehouseId == null) {
          const distributors = await executeTool("getDistributors", { limit: 100 }, profile);
          const distributorList = Array.isArray((distributors as any)?.distributors)
            ? (distributors as any).distributors
            : Array.isArray(distributors)
              ? distributors
              : [];
          if (distributorList.length) {
            const picked = pickBestDistributorName(distributorName, distributorList as Array<{ distributor_name?: string | null }>);
            if (picked) {
              distributorName = picked;
              resolved = await resolveWarehouseForDistributorNameFromSql(distributorName);
            }
          }
        }

        const warehouseLabel =
          distributorWarehouseIntent.scope === "central"
            ? "central warehouse"
            : distributorWarehouseIntent.scope === "local"
              ? "local warehouse"
              : "warehouse";
        const locationSuffix = resolved.location ? `, ${resolved.location}` : "";
        const reply =
          resolved.warehouseId == null
            ? `I could not find a mapped ${warehouseLabel} for **${distributorName}** yet.\n\nTry the exact distributor name from ERP, and I can recheck the mapping.`
            : `The ${warehouseLabel} for **${resolved.distributorName}** is **${resolved.warehouseName ?? "Warehouse"}** (ID: ${resolved.warehouseId}${locationSuffix}).`;

        return sendAssistantResponse(reply);
      }

      const distributorIntent = parseDistributorOrdersIntent(userMessage);
      const distributorProductIntent = parseDistributorProductOrdersIntent(userMessage);
      if (profile.role === "super_admin" && distributorProductIntent) {
        // Resolve distributor name directly from ERP first (not limited list),
        // so "Viraj Life Science" doesn't get mis-picked as another "...Life Sciences" account.
        const direct = await resolveWarehouseForDistributorNameFromSql(distributorProductIntent.distributorName);
        let resolvedDistributorName = direct.distributorName || distributorProductIntent.distributorName;
        if (!direct.distributorName) {
          const distributors = await executeTool("getDistributors", { limit: 2000 }, profile);
          const distributorList = Array.isArray((distributors as any)?.distributors)
            ? (distributors as any).distributors
            : Array.isArray(distributors)
              ? distributors
              : [];
          resolvedDistributorName =
            pickBestDistributorName(
              distributorProductIntent.distributorName,
              distributorList as Array<{ distributor_name?: string | null }>,
            ) ?? distributorProductIntent.distributorName;
        }

        const toolRes = await executeTool(
          "getOrdersByLineItem",
          { productQuery: distributorProductIntent.productQuery, limit: 100 },
          profile,
        );
        if ((toolRes as any)?.error) {
          const errReply = String((toolRes as any).error);
          return sendAssistantResponse(errReply);
        }

        const allOrders = Array.isArray((toolRes as any)?.orders) ? (toolRes as any).orders : [];
        const filtered = allOrders.filter((o: any) =>
          customerMatchesDistributor(
            String(o?.customer_name ?? o?.distributor_name ?? ""),
            resolvedDistributorName,
          ),
        );

        const productName = String((toolRes as any)?.product?.product_name ?? distributorProductIntent.productQuery);
        const reply = filtered.length
          ? (
              `Here are orders for **${resolvedDistributorName}** containing **${productName}**.\n\n` +
              `| Order Number | Order Date | Status | Distributor | Quantity | Line Total |\n` +
              `|---|---|---|---|---:|---:|\n` +
              filtered
                .slice(0, CHAT_ORDER_LIST_TABLE_MAX)
                .map(
                  (o: any) =>
                    `| ${String(o?.order_number ?? "N/A")} | ${formatDateYmd(o?.order_date)} | ${String(o?.status ?? "N/A")} | ${String(o?.customer_name ?? resolvedDistributorName)} | ${String(o?.quantity ?? 0)} | ${formatINR(o?.line_total)} |`,
                )
                .join("\n")
            )
          : (
              `I checked ERP and found no orders for **${resolvedDistributorName}** containing **${productName}**.\n\n` +
              `If needed, I can also check nearby product names/SKU variants for this distributor.`
            );

        return sendAssistantResponse(reply);
      }

      if (profile.role === "super_admin" && distributorIntent) {
        let distributorName = distributorIntent.distributorName;
        if (/^(all\s+)?distributor(s)?$/i.test(distributorName.trim())) {
          const clarify =
            "Please specify the distributor name (for example **Krisshna Enterprise** or **Viraj Life Science**), and I will show that distributor's orders.";
          return sendAssistantResponse(clarify);
        }
        let distributorOrders = await executeTool("getDistributorOrdersByName", { name: distributorName }, profile);
        if ((distributorOrders as any)?.error) {
          const distributors = await executeTool("getDistributors", { limit: 100 }, profile);
          const distributorList = Array.isArray((distributors as any)?.distributors)
            ? (distributors as any).distributors
            : Array.isArray(distributors)
              ? distributors
              : [];
          if (distributorList.length) {
            const picked = pickBestDistributorName(distributorName, distributorList as Array<{ distributor_name?: string | null }>);
            if (picked) {
              distributorName = picked;
              distributorOrders = await executeTool("getDistributorOrdersByName", { name: distributorName }, profile);
            }
          }
        }

        const orders = Array.isArray((distributorOrders as any)?.orders)
          ? (distributorOrders as any).orders
          : Array.isArray(distributorOrders)
            ? distributorOrders
            : [];
        if (!orders.length) {
          const err = (distributorOrders as any)?.error;
          const noOrdersReply = err
            ? String(err)
            : `I could not find any orders for distributor **${distributorName}** in the current ERP scope.\n\nIf needed, I can also try a nearby distributor name match and recheck.`;
          return sendAssistantResponse(noOrdersReply);
        }

        const dedupedOrders = dedupeOrdersByNumber(orders as Array<{ order_number?: unknown }>);
        const latestOrders = dedupedOrders.slice(0, CHAT_ORDER_LIST_TABLE_MAX);
        const statusCounts = new Map<string, number>();
        let minDate: string | null = null;
        let maxDate: string | null = null;
        for (const o of dedupedOrders as any[]) {
          const st = String(o?.status ?? "N/A");
          statusCounts.set(st, (statusCounts.get(st) ?? 0) + 1);
          const d = formatDateYmd(o?.order_date ?? o?.created_at);
          if (d && d !== "N/A") {
            if (!minDate || d < minDate) minDate = d;
            if (!maxDate || d > maxDate) maxDate = d;
          }
        }
        const statusSummary = Array.from(statusCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([st, cnt]) => `${st}: ${cnt}`)
          .join(", ");
        const timelineSummary = minDate && maxDate ? `${minDate} to ${maxDate}` : "Not available";

        const rows = latestOrders
          .map((o: any) => {
            const rawVal = o?.order_value ?? o?.total_amount ?? o?.order_amount ?? o?.Total_Order_Amount ?? null;
            const valStr =
              rawVal != null && Number.isFinite(Number(rawVal))
                ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(rawVal))
                : "N/A";
            return `| ${String(o?.order_number ?? "N/A")} | ${String(o?.customer_name ?? distributorName)} | ${String(o?.status ?? "N/A")} | ${formatDateYmd(o?.order_date ?? o?.created_at)} | ${valStr} |`;
          })
          .join("\n");
        const distributorReply =
          `Here are recent orders for **${distributorName}** from ERP.\n\n` +
          `Status distribution: ${statusSummary || "Not available"}\n\n` +
          `Timeline: ${timelineSummary}\n\n` +
          `| Order Number | Distributor Name | Status | Order Date | Order Value |\n|---|---|---|---|---|\n${rows}\n\n` +
          `If you want, I can show older orders for this distributor or drill down into a specific order.`;
        return sendAssistantResponse(distributorReply);
      }

      const lineItemIntent =
        parseOrdersByLineItemIntent(userMessage) ??
        inferLineItemFollowUpIntent(userMessage, history ?? []);
      if (lineItemIntent) {
        const toolRes = await executeTool(
          "getOrdersByLineItem",
          { productQuery: lineItemIntent.productQuery, limit: 50 },
          profile,
        );
        const deterministicReply = formatOrdersByLineItemReply(toolRes);
        return sendAssistantResponse(deterministicReply);
      }
    } catch (deterministicError) {
      console.error("Deterministic chat handler failed:", deterministicError);
      // Fall back to normal LLM/tool path instead of returning a hard error.
    }

    const voucherTokensFromUser = extractErpVoucherTokens(userMessage);
    const numericIdsFromUser = extractBareNumericSalesOrderIds(userMessage);
    const primaryVoucher = voucherTokensFromUser[0] ?? null;

    // User asked to "track an order" but pasted an invoice voucher (series .106.)
    if (
      primaryVoucher &&
      looksLikeErpInvoiceVoucherNumber(primaryVoucher) &&
      /\b(order|track|where\s+is|status|details)\b/i.test(userMessage) &&
      !/\b(invoice|tax\s+invoice|bill(ing)?|gst)\b/i.test(userMessage)
    ) {
      try {
        const inv = await executeTool("getInvoiceDetails", { invoiceNumber: primaryVoucher }, profile);
        if (inv && typeof inv === "object" && !(inv as { error?: string }).error) {
          const reply = formatInvoiceOrderMislabelReply(primaryVoucher, inv);
          return sendAssistantResponse(reply);
        }
      } catch (e) {
        console.error("Invoice-vs-order clarification handler failed:", e);
      }
    }

    /** Order id from this message only — never reuse a prior turn's order for status lookups. */
    const orderNumberFromCurrentMessageOnly = extractPrimaryOrderTokenFromCurrentMessageOnly(userMessage);
    const orderNumberFromRecentContext =
      history
        ?.map((h) => h.response ?? "")
        .flatMap((t) => extractOrderLookupTokensFromText(t))
        .find(Boolean) ?? null;

    const nextStepVoucher = orderNumberFromCurrentMessageOnly ?? orderNumberFromRecentContext;
    if (
      nextStepVoucher &&
      !looksLikeErpInvoiceVoucherNumber(nextStepVoucher) &&
      nextStepOrEscalationIntent(userMessage)
    ) {
      try {
        const orderRes = await executeTool("getOrderStatus", { orderNumber: nextStepVoucher }, profile);
        if (orderRes && typeof orderRes === "object" && !(orderRes as { error?: string }).error) {
          const reply = formatNextStepOrderReply(nextStepVoucher, orderRes);
          return sendAssistantResponse(reply);
        }
      } catch (e) {
        console.error("Next-step order handler failed:", e);
      }
    }

    /** Deterministic ERP status: only when this message contains an order id (no history fallback). */
    const deterministicLookupToken = orderNumberFromCurrentMessageOnly;
    if (
      deterministicLookupToken &&
      !parseInvoicesByOrderIntent(userMessage) &&
      !userMentionsInvoices &&
      wantsDeterministicOrderLookup(userMessage, deterministicLookupToken) &&
      !looksLikeErpInvoiceVoucherNumber(deterministicLookupToken)
    ) {
      try {
        const deterministicOrderReply = await formatDeterministicOrderStatusReply(deterministicLookupToken, profile);
        return sendAssistantResponse(deterministicOrderReply);
      } catch (e) {
        console.error("Deterministic ERP order status failed:", e);
      }
    }

    const looksLikeOrderStatusQuery =
      /status|track|where is|delivery|estimated delivery|expected delivery|next update|next-update|raise udr|sales order|order shows completed/i.test(userMessage) &&
      !/invoice|tax invoice|billing|gst/i.test(userMessage);

    if (looksLikeOrderStatusQuery && !orderNumberFromCurrentMessageOnly) {
      const clarificationReply =
        "Share your **sales order ID** (digits such as **830138**) or the full **ERP voucher** (e.g. **8.105.260218.39**). I only use an order number from **this message**, not from earlier chat. You can also say **check my order** or **recent orders** to list ERP orders for your access.";
      return sendAssistantResponse(clarificationReply);
    }

    const availableTools = aiTools;
    let currentMessages = [...messages];
    let maxIterations = 2;
    let iteration = 0;

    while (iteration < maxIterations) {
      const completion = await openai.chat.completions.create({ model: "gpt-4o", messages: currentMessages, tools: availableTools, tool_choice: "auto", temperature: 0.5, max_tokens: 1500 });
      const assistant = completion.choices[0]?.message;
      if (!assistant) break;
      currentMessages.push(assistant);
      if (!assistant.tool_calls?.length) break;

      const toolResults = await Promise.all(
        assistant.tool_calls
          .filter((call) => call.type === "function")
          .map(async (call) => {
            const parsedArgs = call.function.arguments ? JSON.parse(call.function.arguments) : {};
            const result = await executeTool(call.function.name, parsedArgs, profile);
            return { role: "tool" as const, tool_call_id: call.id, content: JSON.stringify(result) };
          }),
      );
      currentMessages.push(...toolResults);
      iteration++;
    }

    const orderItemsFromTool = extractOrderItemsFromToolMessages(currentMessages);
    const productCardFromTool = extractProductCardFromToolMessages(currentMessages);

    const streamCompletion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        ...currentMessages,
        {
          role: "system",
          content: `CRITICAL: When returning lists and cards:
1. For order/invoice list tables, show up to first 20 rows. For broad inventory skims, show up to first 5 rows unless user asked for a specific product.
2. Do NOT output \`\`\`json\`\`\` blocks yourself — the server attaches structured product/order cards from tool results. You may give a short prose line if helpful; for product tracking, prefer referring to the on-screen card (latest orders + availability).
3. If tool returns 'product_candidates', list candidates in a markdown table and ask for clarification.`,
        },
      ],
      stream: true,
      temperature: 0.5,
      max_tokens: 1500,
    });

    let aggregated = "";
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        for await (const part of streamCompletion) {
          const token = part.choices[0]?.delta?.content ?? "";
          if (token) {
            aggregated += token;
            controller.enqueue(encoder.encode(token));
          }
        }
        const preAppendLength = aggregated.length;
        const withItems = appendOrderItemsSectionIfMissing(aggregated, orderItemsFromTool);
        const withLaneA = withItems;
        const withProductCard = appendProductCardJsonBlockIfMissing(withLaneA, productCardFromTool);
        const withFollowUp = appendFollowUp(withProductCard);

        const finalDiff = withFollowUp.length - preAppendLength;
        if (finalDiff > 0) {
          controller.enqueue(encoder.encode(withFollowUp.slice(-finalDiff)));
        }

        aggregated = ensureSafeReply(withFollowUp);
        (async () => {
          try {
            await supabase.from("chatbot_messages").insert({ session_id: sessionId, user_id: userId, role: profile.role, sender: "assistant", message: userMessage, response: aggregated });
          } catch (e) { console.error(e); }
        })();
        controller.close();
      },
    });

    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Accel-Buffering": "no" } });
  } catch (error) {
    console.error(error);
    return new Response(ensureSafeReply(""), {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function resolveUserContext(request: Request): Promise<{ profile: UserProfile; userId: number }> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    const admin = createSupabaseAdminClient();
    const { data: { user } } = await admin.auth.getUser(token);
    if (user) {
      const { data: profile } = await admin.from("users").select("user_id,email,name,role_id,company_id,warehouse_id").eq("email", user.email ?? "").single();
      if (profile) {
        const erp = await loadCompanyErpAccounts(admin, profile.company_id);
        return {
          userId: profile.user_id,
          profile: {
            ...profile,
            role: mappedRole(profile.role_id),
            erp_account_id: erp.erp_account_id,
            erp_account_ids: erp.erp_account_ids,
            base_warehouse_id: erp.base_warehouse_id,
          } as any,
        };
      }
    }
  }
  return requireAuthenticatedUser();
}

function mappedRole(roleId: number) { return mapRoleIdToAppRole(roleId); }

function isHomeWarehouseQuery(lowerMessage: string): boolean {
  // Only intercept explicit identity questions about the mapped home warehouse.
  // Avoid hijacking operational queries like "Is A-00161 available in my warehouse?"
  // Supports: home, primary, local, base, assigned, default, nearest
  const qualifiers = "(?:home|primary|local|base|assigned|default|nearest|my)?";
  return new RegExp(`^(which|what)(?:\\s+is)?\\s+my\\s+${qualifiers}\\s*warehouse\\??$`, "i").test(lowerMessage.trim()) ||
    new RegExp(`^my\\s+${qualifiers}\\s*warehouse\\??$`, "i").test(lowerMessage.trim()) ||
    /^which\s+warehouse\s+(?:is\s+)?(?:assigned|mapped|linked)?\s*to\s+me\??$/i.test(lowerMessage.trim()) ||
    /^what(?:'s|\s+is)\s+my\s+(?:default\s+)?warehouse\??$/i.test(lowerMessage.trim());
}

function isOffTopicQuery(lowerMessage: string): boolean {
  const domainSignals = [
    "order",
    "invoice",
    "inventory",
    "stock",
    "product",
    "sku",
    "warehouse",
    "dispatch",
    "delivery",
    "expected",
    "evans",
    "blue",
    "sodium",
    "chloride",
  ];
  const hasDomainSignal = domainSignals.some((token) => lowerMessage.includes(token));
  if (hasDomainSignal) return false;

  // Lightweight off-topic travel/lifestyle signal list based on observed failures.
  return /(holiday|hotel|party|nightlife|pub|brewery|tourism|vacation|trip|bangalore)/.test(lowerMessage);
}

function parseProductOrderHistoryIntent(message: string): { productQuery: string; months: number } | null {
  const clean = String(message ?? "").trim();
  const lower = clean.toLowerCase();
  const wordToNumber: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
  };
  const parseMonthToken = (raw: string): number => {
    const token = String(raw ?? "").trim().toLowerCase();
    const n = Number.isFinite(Number(token)) ? Number(token) : (wordToNumber[token] ?? 3);
    return Math.max(1, Math.min(12, n));
  };

  // Pattern A: "how much did I order <product> in last 3 months"
  const p1 =
    /how\s+much\s+(?:did\s+i\s+)?(?:i\s+)?order(?:ed)?\s+(.+?)\s+in\s+last\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+months?/i;
  const m1 = clean.match(p1);
  if (m1) {
    const productQuery = String(m1[1] ?? "").trim();
    if (!productQuery) return null;
    return { productQuery, months: parseMonthToken(m1[2]) };
  }

  // Pattern B: "what quantity of <product> did I order recently"
  const p2 =
    /(?:what\s+quantity\s+of|quantity\s+of)\s+(.+?)\s+(?:did\s+i\s+)?order(?:ed)?\s+recently/i;
  const m2 = clean.match(p2);
  if (m2) {
    const productQuery = String(m2[1] ?? "").trim();
    if (!productQuery) return null;
    return { productQuery, months: 3 };
  }

  // Pattern C: "<product> ordered in past quarter"
  const p3 = /(.+?)\s+ordered\s+in\s+(?:the\s+)?past\s+quarter/i;
  const m3 = clean.match(p3);
  if (m3) {
    const productQuery = String(m3[1] ?? "").trim();
    if (!productQuery) return null;
    return { productQuery, months: 3 };
  }

  // Pattern D: "<product> ordered in last N months"
  const p4 =
    /(.+?)\s+ordered\s+in\s+last\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+months?/i;
  const m4 = clean.match(p4);
  if (m4) {
    const productQuery = String(m4[1] ?? "").trim();
    if (!productQuery) return null;
    return { productQuery, months: parseMonthToken(m4[2]) };
  }

  // Pattern E: "past quarter" generic with order intent.
  const hasOrderIntent = /\border(?:ed)?\b/.test(lower);
  const hasQuarterWindow = /\bpast\s+quarter\b/.test(lower);
  if (hasOrderIntent && hasQuarterWindow) {
    const stripped = clean
      .replace(/(?:what\s+quantity\s+of|how\s+much|did\s+i\s+order|i\s+order|ordered|in\s+the\s+past\s+quarter|in\s+past\s+quarter|past\s+quarter)/gi, "")
      .trim();
    if (stripped) return { productQuery: stripped, months: 3 };
  }

  return null;
}

function formatINR(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "N/A";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatOrderValueForChat(order: {
  order_value_display?: unknown;
  order_value?: unknown;
  total_amount?: unknown;
  order_amount?: unknown;
  Total_Order_Amount?: unknown;
}): string {
  const display = order?.order_value_display;
  if (typeof display === "string" && display.trim()) {
    return display.trim();
  }
  if (typeof display === "number" && Number.isFinite(display)) {
    return formatINR(display);
  }
  const rawVal =
    order?.order_value ??
    order?.total_amount ??
    order?.order_amount ??
    order?.Total_Order_Amount ??
    null;
  return rawVal != null && Number.isFinite(Number(rawVal)) ? formatINR(Number(rawVal)) : "N/A";
}

function formatDateYmd(value: unknown): string {
  if (value == null) return "N/A";
  const raw = String(value).trim();
  if (!raw) return "N/A";
  // Keep date-only values stable in deterministic table output.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toISOString().slice(0, 10);
}

function formatProductOrderHistoryReply(toolRes: any, months: number): string {
  if (toolRes?.error) return String(toolRes.error);

  if (Array.isArray(toolRes?.product_candidates) && toolRes.product_candidates.length > 0) {
    const rows = toolRes.product_candidates
      .slice(0, 5)
      .map((c: any, idx: number) => `| ${idx + 1} | ${String(c?.product_name ?? "N/A")} | ${String(c?.sku ?? "N/A")} |`)
      .join("\n");
    return (
      `I found multiple product matches. Please confirm which one you mean.\n\n` +
      `| # | Product | SKU |\n|---|---|---|\n${rows}`
    );
  }

  const productName = String(toolRes?.product?.product_name ?? toolRes?.product?.sku ?? "Product");
  const totalQuantity = Number(toolRes?.total_quantity ?? 0);
  const orders = Array.isArray(toolRes?.orders) ? toolRes.orders : [];
  const header = `In the last ${months} month(s), you ordered a total of **${totalQuantity}** units of **${productName}**.`;

  if (!orders.length) {
    return `${header}\n\nI checked this period and found no matching orders.`;
  }

  const rows = orders
    .slice(0, 10)
    .map(
      (o: any) =>
        `| ${String(o?.order_number ?? "N/A")} | ${formatDateYmd(o?.order_date)} | ${String(o?.quantity ?? 0)} | ${formatINR(o?.line_total)} | ${String(o?.status ?? "N/A")} |`,
    )
    .join("\n");

  return (
    `${header}\n\n` +
    `| Order Number | Order Date | Quantity | Line Total | Status |\n` +
    `|---|---|---:|---:|---|\n` +
    `${rows}`
  );
}

/** "Orders in local/base warehouse" — ERP location via analysis_id or Despatch_Location_ID (not lifecycle ALLOCATED_LOCAL_WAREHOUSE). */
function parseLocalWarehouseOrdersIntent(message: string): boolean {
  const lower = String(message ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!/\border(s)?\b/.test(lower)) return false;
  if (/\ballocated\s+local\b/.test(lower)) return false;
  return (
    /\blocal\s+warehouses?\b/.test(lower) ||
    /\b(base|home)\s+warehouse\b/.test(lower) ||
    /\bcompany\s+warehouse\b/.test(lower)
  );
}

function parseStatusOrderListIntent(message: string): { status: string } | null {
  const raw = String(message ?? "").trim();
  const lower = normalizeUserTextForIntent(raw);
  if (!/\border(s)?\b/.test(lower)) return null;

  // GUARD: If the user mentions a specific voucher or order ID, don't treat this as a general status list request.
  // This prevents queries like "What is the delivery date for order X" from triggering a list of all delivered orders.
  if (extractPrimaryOrderTokenFromCurrentMessageOnly(raw)) return null;

  // Tolerant matching for natural phrasing + typos.
  if (/\bdeliver(?:ed|y|ies)?\b|\bdeliverd\b|\bdelivred\b/.test(lower)) return { status: "DELIVERED" };
  if (/\border\s*[_ -]?\s*receiv(?:ed|d)\b|\brecieved\b|\brecived\b/.test(lower)) return { status: "ORDER_RECEIVED" };
  if (/\bpending\b/.test(lower)) return { status: "PENDING" };
  if (/\bin\s*[_ -]?\s*prepar(?:ation|e?tion)\b|\bprepration\b|\bpreparation\b/.test(lower)) return { status: "IN_PREPARATION" };
  if (/\bawait(?:ing)?\s+factory\b|\bfactory\b/.test(lower)) return { status: "AWAITING_FACTORY" };
  if (/\bdispatch\s*[_ -]?\s*ready\b|\bready\s+for\s+dispatch\b/.test(lower)) return { status: "DISPATCH_READY" };
  if (/\ballocated\s+central\b/.test(lower)) return { status: "ALLOCATED_CENTRAL_WAREHOUSE" };
  if (/\ballocated\s+local\b/.test(lower)) return { status: "ALLOCATED_LOCAL_WAREHOUSE" };

  const m = raw.match(/orders?\s+(?:with|having|in|under)\s+([A-Z_ ]+?)\s+status/i);
  if (!m) return null;
  const status = String(m[1] ?? "").trim();
  if (!status) return null;
  return { status };
}

function normalizeStatusFilter(rawStatus: string): string {
  const s = String(rawStatus ?? "").trim().toUpperCase().replace(/\s+/g, "_");
  const aliases: Record<string, string> = {
    ORDER_RECEIVED: "ORDER_RECEIVED",
    PENDING: "PENDING",
    RECEIVED: "ORDER_RECEIVED",
    ORDER_RECIEVED: "ORDER_RECEIVED",
    ORDER_RECIVED: "ORDER_RECEIVED",
    IN_PREPARATION: "IN_PREPARATION",
    PREPARATION: "IN_PREPARATION",
    PREPRATION: "IN_PREPARATION",
    AWAITING_FACTORY: "AWAITING_FACTORY",
    DISPATCH_READY: "DISPATCH_READY",
    DELIVERED: "DELIVERED",
  };
  return aliases[s] ?? s;
}

function isPendingOrdersIntent(message: string): boolean {
  const lower = normalizeUserTextForIntent(message);
  return /show\s+me\s+all\s+pending\s+orders|all\s+pending\s+orders|pending\s+orders/.test(lower);
}

function isActiveNonDeliveredStatus(status: unknown): boolean {
  const s = String(status ?? "").trim().toUpperCase();
  if (!s) return false;
  return !["DELIVERED", "CANCELLED", "CANCELED", "CLOSED"].includes(s);
}

function parseDeliveredByTransportIntent(message: string): { transportName: string } | null {
  const raw = normalizeUserTextForIntent(message);
  if (!raw) return null;
  if (extractPrimaryOrderTokenFromCurrentMessageOnly(message)) return null;
  const m =
    raw.match(/\borders?\s+(?:are\s+)?delivered\s+by\s+(.+)$/i) ??
    raw.match(/\bdelivered\s+orders?\s+(?:by|via|through)\s+(.+)$/i);
  if (!m?.[1]) return null;
  const transportName = String(m[1] ?? "").trim().replace(/[?.!,]+$/g, "").trim();
  if (!transportName) return null;
  return { transportName };
}

function normalizeTransportTokens(value: string): string[] {
  const cleaned = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(transport|transporter|tpt|logistics|courier|co)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.split(" ").filter((t) => t.length >= 3) : [];
}

function transportMatchesQuery(actual: unknown, query: string): boolean {
  const actualTokens = normalizeTransportTokens(String(actual ?? ""));
  const queryTokens = normalizeTransportTokens(query);
  if (!actualTokens.length || !queryTokens.length) return false;
  const haystack = actualTokens.join(" ");
  return queryTokens.every((qt) => haystack.includes(qt));
}

function isDelayedOrdersIntent(message: string): boolean {
  const lower = normalizeUserTextForIntent(message);
  if (!/\border(s)?\b/.test(lower)) return false;
  if (extractPrimaryOrderTokenFromCurrentMessageOnly(message)) return false;
  return /\bdelay(?:ed)?\b|\brunning\s+late\b|\blate\s+orders?\b|\boverdue\b|\bexceed(?:ed|ing)?\b/.test(lower);
}

function cleanDistributorName(rawName: string): string {
  return String(rawName ?? "")
    .replace(/\b(?:in|at|from|for)\b[^\w]*?\b(?:local|base|home|assigned|default|central|centrally|centr(al|e)|cetral)\b[^\w]*?\bwarehouse\b.*$/i, "")
    .replace(/\b(?:in|at|from|for)\b[^\w]*?\bwarehouse\b.*$/i, "")
    .replace(/[?.!,]+$/g, "")
    .trim();
}

function parseDistributorWarehouseIntent(message: string): { distributorName: string; scope: "local" | "central" | "generic" } | null {
  const raw = String(message ?? "").trim();
  const lower = raw.toLowerCase().replace(/\s+/g, " ");
  if (!/\bwarehouse\b/.test(lower)) return null;
  if (/\border(s)?\b/.test(lower)) return null;

  const scope: "local" | "central" | "generic" =
    /\bcentral\s+warehouse\b/.test(lower)
      ? "central"
      : /\b(local|home|base|assigned|default)\s+warehouse\b/.test(lower)
        ? "local"
        : "generic";

  const m =
    raw.match(/\b(?:local|home|base|assigned|default|central)?\s*warehouse\s+(?:of|for)\s+(.+)$/i) ??
    raw.match(/\bfor\s+(.+?)\s+(?:distributor\s+)?(?:local|home|base|assigned|default|central)?\s*warehouse\b/i) ??
    raw.match(/^(.+?)\s+(?:distributor\s+)?(?:local|home|base|assigned|default|central)?\s*warehouse\??$/i);
  if (!m?.[1]) return null;

  const distributorName = cleanDistributorName(
    String(m[1])
    .replace(/^\s*(the\s+)?distributor\s+/i, "")
    .replace(/\s+distributor\s*$/i, "")
    .trim(),
  );
  if (!distributorName) return null;
  return { distributorName, scope };
}

function parseDistributorOrdersIntent(message: string): { distributorName: string } | null {
  const raw = String(message ?? "").trim();
  const normalized = normalizeUserTextForIntent(raw);
  const m =
    normalized.match(/orders?\s+(?:of|for|under)\s+(.+)$/i) ??
    normalized.match(/(?:show|list|get)\s+(.+?)\s+orders?$/i) ??
    normalized.match(/distributor\s+orders?\s+(?:of|for|under)\s+(.+)$/i) ??
    normalized.match(/^(?:show|list|get)\s+me\s+(.+)$/i);
  if (!m?.[1]) return null;
  const distributorName = cleanDistributorName(
    String(m[1])
    .replace(/^\s*(the\s+)?distributor\s+/i, "")
    .replace(/\s+distributor\s*$/i, "")
    .trim(),
  );
  if (!distributorName) return null;
  return { distributorName };
}

async function resolveWarehouseForDistributorNameFromSql(
  distributorName: string,
): Promise<{ distributorName: string; warehouseId: number | null; warehouseName: string | null; location: string | null }> {
  const search = `%${distributorName.trim()}%`;
  const { data: accounts } = await querySqlServer<{ ACCOUNT_ID: number; FULL_NAME: string | null }>(
    `SELECT TOP 20 ACCOUNT_ID, FULL_NAME
     FROM dbo.ACCOUNT_MASTER
     WHERE FULL_NAME LIKE @s OR CAST(ACCOUNT_ID AS NVARCHAR(50)) LIKE @s
     ORDER BY FULL_NAME ASC`,
    { s: search },
  );

  const accountRows = (accounts ?? []).filter((a) => Number.isFinite(Number(a.ACCOUNT_ID)) && Number(a.ACCOUNT_ID) > 0);
  if (!accountRows.length) {
    return { distributorName, warehouseId: null, warehouseName: null, location: null };
  }

  const resolvedName = String(accountRows[0]?.FULL_NAME ?? distributorName).trim() || distributorName;
  const accountIds = Array.from(new Set(accountRows.map((a) => Number(a.ACCOUNT_ID))));
  const inList = accountIds.join(",");

  const { data: localRows } = await querySqlServer<{ analysis_id: number | null; cnt: number }>(
    `SELECT TOP 1 h.analysis_id, COUNT(1) AS cnt
     FROM dbo.sales_order_header h
     WHERE h.account_id IN (${inList})
       AND h.analysis_id IS NOT NULL
     GROUP BY h.analysis_id
     ORDER BY cnt DESC, h.analysis_id ASC`,
  );

  const warehouseId = Number(localRows?.[0]?.analysis_id);
  if (!Number.isFinite(warehouseId) || warehouseId <= 0) {
    return { distributorName: resolvedName, warehouseId: null, warehouseName: null, location: null };
  }

  const details = await resolveWarehouseDetailsByIdFromSql(warehouseId);
  const warehouseName = details.name ?? (await resolveWarehouseNameByIdFromSql(warehouseId));
  return {
    distributorName: resolvedName,
    warehouseId,
    warehouseName: warehouseName ?? null,
    location: details.location ?? null,
  };
}

function parseInvoicesByOrderIntent(message: string): { orderNumber: string } | null {
  const raw = String(message ?? "").trim();
  const lower = normalizeUserTextForIntent(raw);
  if (!/\binvoices?\b/.test(lower) || !/\border\b/.test(lower)) return null;
  const token = extractPrimaryOrderTokenFromCurrentMessageOnly(raw);
  if (!token) return null;
  return { orderNumber: token };
}

function parseTodayOrdersIntent(message: string): boolean {
  const lower = String(message ?? "").toLowerCase();
  if (!/\border(s)?\b/.test(lower)) return false;
  if (extractPrimaryOrderTokenFromCurrentMessageOnly(message)) return false;
  return /\btoday('?s)?\b/.test(lower);
}

function isWarehouseListIntent(message: string): boolean {
  const lower = String(message ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!/\bwarehouse(s)?\b/.test(lower)) return false;
  if (/\border(s)?\b|\binventory\b|\bstock\b|\bproduct(s)?\b|\bdistributor(s)?\b/.test(lower)) return false;
  return (
    /\blist\b|\bshow\b|\bdisplay\b|\bgive\b|\bshare\b|\bfetch\b|\bget\b|\bwhat\b|\bwhich\b|\ball\b/.test(lower) ||
    /\bwarehouse\s+list\b|\blist\s+of\s+warehouse(s)?\b/.test(lower)
  );
}

function isDistributorListIntent(message: string): boolean {
  const lower = String(message ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!/\bdistributor(s)?\b/.test(lower)) return false;
  if (/\border(s)?\b|\bwarehouse(s)?\b|\binventory\b|\bstock\b/.test(lower)) return false;
  return (
    /\blist\b|\bshow\b|\bdisplay\b|\bgive\b|\bshare\b|\bfetch\b|\bget\b|\bwhat\b|\bwhich\b|\ball\b|\bsearch\b|\bfind\b|\bextract\b/.test(lower) ||
    /\bdistributor\s+list\b|\blist\s+of\s+distributor(s)?\b|\bcompany\s+list\b/.test(lower)
  );
}

function parseDistributorSearchIntent(message: string): { search: string } | null {
  const lower = String(message ?? "").toLowerCase().trim();
  if (!/\bdistributor\b/.test(lower)) return null;
  if (/\border(s)?\b/.test(lower)) return null;
  const m = lower.match(/(?:search|find|extract)\s+(?:for\s+)?(?:distributor\s+)?(.+)$/i);
  if (m?.[1]) {
    const s = m[1].replace(/[?.!,]+$/g, "").trim();
    if (s && !/^(my|all|list|the|a|an)$/i.test(s)) return { search: s };
  }
  return null;
}

function formatWarehouseListReply(warehouseRes: unknown): string {
  if (warehouseRes && typeof warehouseRes === "object" && "error" in (warehouseRes as any)) {
    return (warehouseRes as any).error;
  }
  const rows = Array.isArray((warehouseRes as any)?.warehouses)
    ? (warehouseRes as any).warehouses
    : Array.isArray(warehouseRes)
      ? warehouseRes
      : [];
  if (!rows.length) return "I could not find any warehouses in the current ERP scope.";

  const tableRows = rows
    .slice(0, CHAT_ORDER_LIST_TABLE_MAX)
    .map((w: any) => {
      const name = String(w?.warehouse_name ?? w?.name ?? "N/A");
      const location = String(w?.location ?? w?.city ?? w?.address ?? "N/A");
      return `| ${name} | ${location} |`;
    })
    .join("\n");

  return `Here are the warehouses from ERP.\n\n| Warehouse Name | Location |\n|---|---|\n${tableRows}`;
}

function formatDistributorListReply(distributorRes: unknown): string {
  if (distributorRes && typeof distributorRes === "object" && "error" in (distributorRes as any)) {
    return (distributorRes as any).error;
  }
  const rows = Array.isArray((distributorRes as any)?.distributors)
    ? (distributorRes as any).distributors
    : Array.isArray(distributorRes)
      ? distributorRes
      : [];
  if (!rows.length) return "I could not find any distributors in the current ERP scope.";

  const tableRows = rows
    .slice(0, CHAT_ORDER_LIST_TABLE_MAX)
    .map((d: any) => {
      const name = String(d?.distributor_name ?? d?.company_name ?? d?.name ?? "N/A");
      const accountId = String(d?.erp_account_id ?? d?.account_id ?? d?.distributor_id ?? d?.id ?? "N/A");
      const orderCount = d?.order_count != null ? String(d.order_count) : "N/A";
      return `| ${name} | ${accountId} | ${orderCount} |`;
    })
    .join("\n");

  return `Here are the distributors from ERP (sorted by order volume).\n\n| Distributor Name | Account ID | Order Count |\n|---|---|---|\n${tableRows}`;
}

function formatDistributorSearchReply(distributorRes: any): string {
  const rows = Array.isArray(distributorRes?.distributors) ? distributorRes.distributors : [];
  if (!rows.length) return "I could not find any distributors matching that search in ERP.";

  const tableRows = rows
    .slice(0, 20)
    .map((d: any) => {
      const name = String(d?.account_name ?? "N/A");
      const accountId = String(d?.erp_account_id ?? "N/A");
      const city = String(d?.city ?? "N/A");
      const gst = String(d?.gst_no ?? "N/A");
      return `| ${name} | ${accountId} | ${city} | ${gst} |`;
    })
    .join("\n");

  return `I found matching distributors from ERP.\n\n| Distributor Name | Account ID | City | GST No |\n|---|---|---|---|\n${tableRows}`;
}

function isDispatchQueueIntent(message: string): boolean {
  const lower = String(message ?? "").toLowerCase();
  return /\bdispatch\s*queue\b|\bshow\s+dispatch\b|\bdispatch-ready\b|\bready\s+for\s+dispatch\b/.test(lower);
}

function parseTodayInvoicesIntent(message: string): boolean {
  const lower = String(message ?? "").toLowerCase();
  if (!/\binvoice(s)?\b/.test(lower)) return false;
  return /\btoday('?s)?\b/.test(lower);
}

function normalizedWords(text: string): string[] {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3);
}

function customerMatchesDistributor(customerName: string | null | undefined, distributorName: string): boolean {
  const customerWords = new Set(normalizedWords(customerName ?? ""));
  const distributorWords = normalizedWords(distributorName);
  if (!distributorWords.length) return false;
  // Require at least two overlapping tokens for robust matching (e.g. "viraj life science").
  const overlap = distributorWords.reduce((acc, w) => (customerWords.has(w) ? acc + 1 : acc), 0);
  return overlap >= Math.min(2, distributorWords.length);
}

function pickBestDistributorName(queryName: string, candidates: Array<{ distributor_name?: string | null }>): string | null {
  const qWords = new Set(normalizedWords(queryName));
  if (!qWords.size) return null;
  const qWordCount = qWords.size;
  let best: { name: string; score: number; candidateWordCount: number } | null = null;
  for (const c of candidates) {
    const name = String(c?.distributor_name ?? "").trim();
    if (!name) continue;
    const cWords = normalizedWords(name);
    const score = cWords.reduce((acc, w) => (qWords.has(w) ? acc + 1 : acc), 0);
    if (!best || score > best.score) best = { name, score, candidateWordCount: cWords.length };
  }
  if (!best) return null;
  const minOverlap = qWordCount <= 2 ? 1 : 2;
  if (best.score < minOverlap) return null;

  // For long names, require stronger overlap so generic terms do not hijack matching.
  if (qWordCount >= 4) {
    const overlapCoverage = best.score / qWordCount;
    const jaccard = best.score / (qWordCount + best.candidateWordCount - best.score);
    if (overlapCoverage < 0.5 && jaccard < 0.34) return null;
  }

  return best.name;
}

type ChatWarehouseOrderRow = {
  order_id?: number;
  order_number?: string;
  status?: string;
  created_at?: string;
  order_value?: number | null;
  warehouse_name?: string | null;
};

/** Same rule as local/central shortcuts: only active/pending rows (not yet in prep/dispatch) appear in the table. */
async function filterToOrderReceivedOnly(list: ChatWarehouseOrderRow[]): Promise<ChatWarehouseOrderRow[]> {
  const allowed = ["ORDER_RECEIVED", "ALLOCATED_LOCAL_WAREHOUSE", "ALLOCATED_CENTRAL_WAREHOUSE", "AWAITING_FACTORY"];
  if (isSqlServerDataEnabled()) {
    const flagged = await Promise.all(
      list.map(async (o) => {
        const id = Number(o.order_id);
        if (!Number.isFinite(id) || id <= 0) return { o, keep: false };
        const canonical = String(await deriveOrderStatusFromERP(id)).toUpperCase();
        return { o, keep: allowed.includes(canonical) };
      }),
    );
    return flagged.filter((x) => x.keep).map((x) => x.o);
  }
  return list.filter((o) => allowed.includes(String(o.status ?? "").toUpperCase()));
}

async function formatLocalWarehouseOrdersReply(profile: UserProfile, distributorName: string | null = null): Promise<string> {
  let warehouseId: number | null = null;
  let resolvedDistributorLabel: string | null = null;

  if (profile.role === "super_admin" && distributorName) {
    const resolved = await resolveWarehouseForDistributorNameFromSql(distributorName);
    warehouseId = resolved.warehouseId;
    resolvedDistributorLabel = resolved.distributorName;
  } else if (profile.role === "warehouse") {
    warehouseId = profile.warehouse_id ?? null;
  } else if (profile.role === "distributor") {
    warehouseId = profile.base_warehouse_id ?? null;
  } else if (profile.role === "super_admin") {
    const raw = process.env.ERP_LOCAL_HUB_LOCATION_ID;
    const n = raw != null && String(raw).trim() !== "" ? Number(raw) : NaN;
    warehouseId = Number.isFinite(n) && n > 0 ? n : 1;
  }

  if (warehouseId == null || !Number.isFinite(Number(warehouseId))) {
    if (profile.role === "super_admin" && distributorName) {
      return `I could not find a mapped local warehouse for **${distributorName}** yet.\n\nTry the exact distributor name from ERP, and I can recheck.`;
    }
    return (
      "We could not find a **default warehouse** on your account.\n\n" +
      "Ask your administrator to set your company’s home warehouse, or type a warehouse name (for example **Delhi** or **Mumbai**) and I will list orders for that location."
    );
  }

  const wid = Number(warehouseId);
  const toolRes = await executeTool("getOrdersByWarehouse", { warehouseId: wid }, profile);
  const orders = Array.isArray(toolRes) ? toolRes : (toolRes as { orders?: unknown[] })?.orders ?? [];
  const err = Array.isArray(toolRes) ? null : (toolRes as { error?: string })?.error;

  if (err) {
    return (
      "Something went wrong while loading orders for that warehouse.\n\n" +
      `Details: ${String(err)}\n\n` +
      "You can try again or ask for **recent orders** instead."
    );
  }

  const list =
    resolvedDistributorLabel
      ? (orders as ChatWarehouseOrderRow[]).filter((o) =>
          customerMatchesDistributor((o as ChatWarehouseOrderRow & { customer_name?: string | null }).customer_name, resolvedDistributorLabel),
        )
      : (orders as ChatWarehouseOrderRow[]);

  const receivedOnly = await filterToOrderReceivedOnly(list);

  const whName = (receivedOnly[0]?.warehouse_name ?? list[0]?.warehouse_name)?.trim() || "your hub warehouse";
  const sliced = receivedOnly.slice(0, CHAT_ORDER_LIST_TABLE_MAX);
  const total = sliced.length;

  if (!total) {
    const erpOffNote = !isSqlServerDataEnabled()
      ? `\n\n**Note:** Live ERP lists are turned off in this environment (\`USE_SQL_SERVER_DATA\` is not enabled). With demo Supabase data, warehouse-scoped lists are often empty even when ERP has orders.`
      : "";
    return (
      `There are **no pending orders** in your **local warehouse** (**${whName}**) that are awaiting preparation, dispatch, or invoicing.\n\n` +
      "If you want to see recently delivered or dispatched orders, ask for **recent orders** or **dispatch queue**." +
      erpOffNote
    );
  }

  const rows = sliced
    .map((o) => {
      const valStr = formatOrderValueForChat(o);
      return `| ${String(o?.order_number ?? "N/A")} | ${String(o?.status ?? "N/A")} | ${TEMP_LOCAL_WAREHOUSE_SUB_STATUS} | ${formatDateYmd(o?.created_at)} | ${valStr} |`;
    })
    .join("\n");
  const countNote =
    total < CHAT_ORDER_LIST_TABLE_MAX
      ? `You are seeing **all ${total}** for this warehouse here (we can show up to **${CHAT_ORDER_LIST_TABLE_MAX}** when there are more).`
      : `Showing the **${CHAT_ORDER_LIST_TABLE_MAX}** latest for this warehouse. Ask if you need older ones.`;

  return (
    `${resolvedDistributorLabel
      ? `Here are the **orders of ${resolvedDistributorLabel}** in local warehouse — **${whName}**.\n\n`
      : `Here are your **orders in the local warehouse** — **${whName}**.\n\n`}` +
    `Latest are listed first. **Eight** rows show at a time; tap **Show more** for the rest. ${countNote}\n\n` +
    `| Order Number | Status | Sub-status | Order Date | Order Value |\n|---|---|---|---|---|\n${rows}`
  );
}

async function formatCentralWarehouseOrdersReply(profile: UserProfile): Promise<string> {
  const resolved = await resolveCentralWarehouseForProfile(profile);
  const warehouseId = resolved.warehouseId;

  if (warehouseId == null || !Number.isFinite(Number(warehouseId))) {
    return (
      "We could not find your **central warehouse** in ERP yet.\n\n" +
      "Your administrator can set **ERP_CENTRAL_WAREHOUSE_LOCATION_ID** to the correct **Location** id, or ensure a warehouse named like “central” exists. " +
      "You can also ask for orders by naming a depot (for example **Delhi** or **Bhiwandi**)."
    );
  }

  const wid = Number(warehouseId);
  const details = await resolveWarehouseDetailsByIdFromSql(wid);
  const whName = (details.name ?? resolved.warehouseName)?.trim() || "central warehouse";

  const toolRes = await executeTool("getOrdersByWarehouse", { warehouseId: wid }, profile);
  const orders = Array.isArray(toolRes) ? toolRes : (toolRes as { orders?: unknown[] })?.orders ?? [];
  const err = Array.isArray(toolRes) ? null : (toolRes as { error?: string })?.error;

  if (err) {
    return (
      "Something went wrong while loading orders for the central warehouse.\n\n" +
      `Details: ${String(err)}\n\n` +
      "You can try again or ask for **recent orders** instead."
    );
  }

  const list = orders as ChatWarehouseOrderRow[];

  const receivedOnly = await filterToOrderReceivedOnly(list);
  const sliced = receivedOnly.slice(0, CHAT_ORDER_LIST_TABLE_MAX);
  const total = sliced.length;

  if (!total) {
    const erpOffNote = !isSqlServerDataEnabled()
      ? `\n\n**Note:** Live ERP lists are turned off in this environment (\`USE_SQL_SERVER_DATA\` is not enabled). With demo Supabase data, warehouse-scoped lists are often empty even when ERP has orders.`
      : "";
    return (
      `There are **no pending orders** at **${whName}** (central warehouse) that are awaiting preparation, dispatch, or invoicing.\n\n` +
      "If you want to see recently delivered or dispatched orders, ask for **recent orders** or **dispatch queue**." +
      erpOffNote
    );
  }

  const rows = sliced
    .map((o) => {
      const valStr = formatOrderValueForChat(o);
      return `| ${String(o?.order_number ?? "N/A")} | ${String(o?.status ?? "N/A")} | ${TEMP_CENTRAL_WAREHOUSE_SUB_STATUS} | ${formatDateYmd(o?.created_at)} | ${valStr} |`;
    })
    .join("\n");

  const countNote =
    total < CHAT_ORDER_LIST_TABLE_MAX
      ? `You are seeing **all ${total}** for this warehouse here (we can show up to **${CHAT_ORDER_LIST_TABLE_MAX}** when there are more).`
      : `Showing the **${CHAT_ORDER_LIST_TABLE_MAX}** latest for this warehouse. Ask if you need older ones.`;

  return (
    `Here are your **orders in the central warehouse** — **${whName}**.\n\n` +
    `Latest are listed first. **Eight** rows show at a time; tap **Show more** for the rest. ${countNote}\n\n` +
    `| Order Number | Status | Sub-status | Order Date | Order Value |\n|---|---|---|---|---|\n${rows}`
  );
}

function formatStatusOrderListReply(status: string, orders: any[]): string {
  const label = status === "PENDING" ? "pending" : status;
  if (!orders.length) {
    return (
      `I checked your accessible ERP scope and found no orders with status **${label}** right now.\n\n` +
      `If helpful, I can show recent orders across all active statuses so you can quickly see what is currently moving.`
    );
  }
  const isDeliveredScope = String(status).toUpperCase() === "DELIVERED";
  const rows = orders
    .slice(0, CHAT_ORDER_LIST_TABLE_MAX)
    .map((o: any) => {
      const valStr = formatOrderValueForChat(o);
      if (isDeliveredScope) {
        const transportName = String(o?.transport_name ?? "").trim();
        const vehicleNo = String(o?.vehicle_number ?? "").trim();
        const transport =
          transportName && vehicleNo
            ? `${transportName} (${vehicleNo})`
            : transportName || vehicleNo || "Not recorded in ERP";
        return `| ${String(o?.order_number ?? "N/A")} | ${String(o?.status ?? "N/A")} | ${formatDateYmd(o?.created_at)} | ${valStr} | ${formatDateYmd(o?.delivery_date)} | ${transport} |`;
      }
      return `| ${String(o?.order_number ?? "N/A")} | ${String(o?.status ?? "N/A")} | ${formatDateYmd(o?.created_at)} | ${valStr} |`;
    })
    .join("\n");
  if (isDeliveredScope) {
    return (
      `Here are orders with status scope **${label}**.\n\n` +
      `| Order Number | Status | Order Date | Order Value | Delivery Date | Transport |\n|---|---|---|---|---|---|\n${rows}`
    );
  }
  return (
    `Here are orders with status scope **${label}**.\n\n` +
    `| Order Number | Status | Order Date | Order Value |\n|---|---|---|---|\n${rows}`
  );
}

async function formatInvoicesByOrderDetailedReply(orderNumber: string, profile: UserProfile): Promise<string> {
  const invoicesByOrder = await executeTool("getInvoicesByOrder", { orderNumber }, profile);
  if ((invoicesByOrder as { error?: string })?.error) return String((invoicesByOrder as { error: string }).error);

  const invoices = Array.isArray((invoicesByOrder as any)?.invoices) ? (invoicesByOrder as any).invoices : [];
  const invoiceCount = Number((invoicesByOrder as any)?.invoice_count ?? invoices.length);
  if (!invoices.length) {
    return (
      `I checked linked billing records for order ${orderNumber}, and no invoices are currently linked.\n\n` +
      `This usually means invoicing is not posted yet for this order.`
    );
  }

  const summaryRows = invoices
    .map((inv: any) => {
      const amount = inv?.total_amount ?? inv?.invoice_total_amount ?? inv?.full_invoice_amount ?? null;
      const status = String(inv?.invoice_status ?? inv?.status ?? "N/A");
      const distributor = String(inv?.customer_full_name ?? inv?.customer_name ?? "N/A");
      return `| ${String(inv?.invoice_number ?? "N/A")} | ${formatDateYmd(inv?.invoice_date)} | ${formatINR(amount)} | ${status} | ${distributor} |`;
    })
    .join("\n");

  const detailBlocks: string[] = [];
  const reconciliationRows: string[] = [];
  for (const inv of invoices) {
    const invoiceNumber = String(inv?.invoice_number ?? "").trim();
    if (!invoiceNumber) continue;
    const full = await executeTool("getInvoiceDetails", { invoiceNumber }, profile);
    if ((full as { error?: string })?.error) continue;
    const card = Array.isArray((full as any)?.invoice_card) ? (full as any).invoice_card[0] : null;
    const items = Array.isArray(card?.items) ? card.items : Array.isArray((full as any)?.items) ? (full as any).items : [];
    const headerTotal = Number(card?.invoice_total_amount ?? inv?.total_amount ?? inv?.invoice_total_amount ?? 0);
    let lineSum = 0;
    if (!items.length) continue;
    const itemRows = items
      .map((it: any, idx: number) => {
        const sku = it?.sku ?? it?.product_catalogue_number ?? "N/A";
        const product = it?.product_description ?? it?.order_product_printing_name ?? `Item ${idx + 1}`;
        const qty = Number(it?.quantity ?? it?.invoice_quantity ?? 0);
        const lineTotal = it?.line_total ?? it?.invoice_line_item_amount ?? null;
        const nLine = Number(lineTotal ?? 0);
        if (Number.isFinite(nLine)) lineSum += nLine;
        return `| ${idx + 1} | ${String(product)} | ${String(sku)} | ${qty} | ${formatINR(lineTotal)} |`;
      })
      .join("\n");
    if (Number.isFinite(headerTotal) && headerTotal > 0) {
      const diff = Math.abs(headerTotal - lineSum);
      const check = diff <= 1 ? "Matched" : `Mismatch (diff ${formatINR(diff)})`;
      reconciliationRows.push(
        `| ${invoiceNumber} | ${formatINR(headerTotal)} | ${formatINR(lineSum)} | ${check} |`,
      );
    }
    detailBlocks.push(
      `Invoice ${invoiceNumber} line items:\n\n| # | Product | SKU | Quantity | Line Total |\n|---:|---|---|---:|---:|\n${itemRows}`,
    );
  }

  const detailSection =
    detailBlocks.length > 0
      ? `\n\nDetailed invoice line items:\n\n${detailBlocks.join("\n\n")}`
      : `\n\nDetailed invoice line items were not available from ERP for these invoices.`;

  const reconciliationSection = reconciliationRows.length
    ? `\n\nInvoice reconciliation check:\n\n| Invoice Number | Invoice Total | Sum of Line Items | Check |\n|---|---:|---:|---|\n${reconciliationRows.join("\n")}`
    : "";

  return (
    `Linked invoices for order ${orderNumber}: ${invoiceCount}.\n\n` +
    `| Invoice Number | Invoice Date | Total Value | Status | Distributor |\n|---|---|---:|---|---|\n${summaryRows}` +
    reconciliationSection +
    detailSection
  );
}

function formatTodayOrdersReply(orders: any[]): string {
  const today = new Date();
  const yyyyMmDd = today.toISOString().slice(0, 10);
  const todayRows = (orders ?? []).filter((o: any) => formatDateYmd(o?.created_at ?? o?.order_date) === yyyyMmDd);
  if (!todayRows.length) {
    return (
      "I checked today's ERP activity and found no orders created in your accessible scope.\n\n" +
      "If you want, I can show the most recent orders from previous days for a quick operational view."
    );
  }
  const rows = todayRows
    .slice(0, CHAT_ORDER_LIST_TABLE_MAX)
    .map((o: any) => {
      const rawVal = o?.order_value ?? o?.total_amount ?? o?.order_amount ?? o?.Total_Order_Amount ?? null;
      const valStr = formatINR(rawVal == null ? null : Number(rawVal));
      return `| ${String(o?.order_number ?? "N/A")} | ${String(o?.status ?? "N/A")} | ${formatDateYmd(o?.created_at ?? o?.order_date)} | ${valStr} |`;
    })
    .join("\n");
  return (
    `Here are orders created today in your accessible scope.\n\n` +
    `| Order Number | Status | Order Date | Order Value |\n|---|---|---|---:|\n${rows}`
  );
}

function formatTodayInvoicesReply(toolRes: any): string {
  if (toolRes?.error) return String(toolRes.error);
  const invoices = Array.isArray(toolRes?.invoices) ? toolRes.invoices : [];
  const total = Number(toolRes?.total_count ?? invoices.length);
  if (!invoices.length) {
    return (
      "I checked today's ERP invoices and found none in your accessible scope.\n\n" +
      "If helpful, I can show the latest available invoice date and list those invoices instead."
    );
  }
  const rows = invoices
    .slice(0, 10)
    .map((inv: any) => {
      const amt = inv?.invoice_total_amount ?? inv?.total_amount ?? inv?.INVOICE_AMOUNT ?? null;
      const customer = String(inv?.customer_full_name ?? inv?.customer_name ?? "-");
      return `| ${String(inv?.invoice_number ?? "N/A")} | ${formatDateYmd(inv?.invoice_date)} | ${customer} | ${formatINR(amt)} |`;
    })
    .join("\n");
  return (
    `I found ${total} invoice(s) for today.\n\n` +
    `| Invoice Number | Invoice Date | Distributor | Amount |\n|---|---|---|---:|\n${rows}`
  );
}

function formatInvoicesForSpecificDateReply(toolRes: any, dateLabel: string): string {
  if (toolRes?.error) return String(toolRes.error);
  const invoices = Array.isArray(toolRes?.invoices) ? toolRes.invoices : [];
  const total = Number(toolRes?.total_count ?? invoices.length);
  if (!invoices.length) {
    return (
      `I checked ERP invoices for ${dateLabel}, and none were found in your accessible scope.\n\n` +
      `If you want, I can fetch the nearest recent invoice date with available records.`
    );
  }
  const rows = invoices
    .slice(0, 10)
    .map((inv: any) => {
      const amt = inv?.invoice_total_amount ?? inv?.total_amount ?? inv?.INVOICE_AMOUNT ?? null;
      const customer = String(inv?.customer_full_name ?? inv?.customer_name ?? "-");
      return `| ${String(inv?.invoice_number ?? "N/A")} | ${formatDateYmd(inv?.invoice_date)} | ${customer} | ${formatINR(amt)} |`;
    })
    .join("\n");
  return (
    `No invoices today. Showing latest available invoices from ${dateLabel} (${total} found).\n\n` +
    `| Invoice Number | Invoice Date | Distributor | Amount |\n|---|---|---|---:|\n${rows}`
  );
}

async function enrichDeliveredOrdersWithLogistics(orders: any[]): Promise<any[]> {
  const salesOrderIds = Array.from(
    new Set(
      (orders ?? [])
        .map((o) => Number(o?.id ?? o?.order_id ?? o?.sales_order_id))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  );
  if (!salesOrderIds.length) return orders;

  const inList = salesOrderIds.map((id) => Math.trunc(id)).join(",");
  const { data, error } = await querySqlServer<{
    sales_order_id: number;
    date_of_removal: string | null;
    transport_name: string | null;
    vehicle_number: string | null;
  }>(
    `WITH ranked AS (
       SELECT
         sob.sales_order_id,
         h.DATE_OF_REMOVAL AS date_of_removal,
         h.TRANSPORT_NAME AS transport_name,
         h.VEHICLE_NUMBER AS vehicle_number,
         ROW_NUMBER() OVER (
           PARTITION BY sob.sales_order_id
           ORDER BY
             CASE WHEN h.DATE_OF_REMOVAL IS NOT NULL THEN 0 ELSE 1 END,
             CASE WHEN h.TRANSPORT_NAME IS NOT NULL AND LTRIM(RTRIM(h.TRANSPORT_NAME)) <> '' THEN 0 ELSE 1 END,
             h.voucher_date DESC,
             h.sales_invoice_header_id DESC
         ) AS rn
       FROM dbo.Sales_Invoice_Header h
       INNER JOIN dbo.Sales_Invoice_Body b ON b.sales_invoice_header_id = h.sales_invoice_header_id
       INNER JOIN dbo.sales_order_body sob ON sob.sales_order_body_id = b.sales_order_body_id
       WHERE sob.sales_order_id IN (${inList})
     )
     SELECT sales_order_id, date_of_removal, transport_name, vehicle_number
     FROM ranked
     WHERE rn = 1`,
  );
  if (error || !data?.length) return orders;

  const logisticsByOrderId = new Map(
    data.map((r) => [
      Number(r.sales_order_id),
      {
        delivery_date: r.date_of_removal,
        transport_name: r.transport_name,
        vehicle_number: r.vehicle_number,
      },
    ]),
  );

  return (orders ?? []).map((o) => {
    const id = Number(o?.id ?? o?.order_id ?? o?.sales_order_id);
    const logistics = logisticsByOrderId.get(id);
    if (!logistics) return o;
    return { ...o, ...logistics };
  });
}

function parseOrdersByLineItemIntent(message: string): { productQuery: string } | null {
  const clean = String(message ?? "").trim();
  const normalized = normalizeUserTextForIntent(clean);
  const showLast = /^(?:show\s+)?last\s+orders?\s+for\s+(.+)$/i.exec(clean);
  if (showLast) {
    const productQuery = String(showLast[1] ?? "").trim();
    if (productQuery) return { productQuery };
  }
  const re = /orders?\s+(?:that\s+have|with|containing)\s+(.+?)\s+as\s+a\s+line\s+item/i;
  const m = clean.match(re);
  if (m) {
    const productQuery = String(m[1] ?? "").trim();
    if (productQuery) return { productQuery };
  }

  // Product-only prompt (for example: "Sodium Chloride ACS, 99.9%") should still
  // return matching orders containing that product.
  if (!/\b(order|orders|invoice|invoices|track|status|warehouse|stock|inventory)\b/.test(normalized)) {
    const looksLikeProductQuery =
      clean.length >= 6 &&
      /[a-z]/i.test(clean) &&
      (/,/.test(clean) || /%/.test(clean) || /\bacs\b/i.test(clean) || /\bglacial\b/i.test(clean));
    if (looksLikeProductQuery) {
      return { productQuery: clean };
    }
  }
  return null;
}

function parseDistributorProductOrdersIntent(message: string): { distributorName: string; productQuery: string } | null {
  const clean = String(message ?? "").trim();
  if (!clean) return null;

  const m1 = clean.match(/\borders?\s+of\s+(.+?)\s+(?:having|with|for)\s+(.+)$/i);
  if (m1) {
    const distributorName = cleanDistributorName(String(m1[1] ?? "").trim());
    const productQuery = String(m1[2] ?? "").trim();
    if (distributorName && productQuery) return { distributorName, productQuery };
  }

  const m2 = clean.match(/\bdid\s+(.+?)\s+(?:make|place|raise)\s+any\s+orders?\s+for\s+(.+)$/i);
  if (m2) {
    const distributorName = cleanDistributorName(String(m2[1] ?? "").trim());
    const productQuery = String(m2[2] ?? "").trim();
    if (distributorName && productQuery) return { distributorName, productQuery };
  }

  return null;
}

function inferLineItemFollowUpIntent(
  currentMessage: string,
  history: Array<{ message?: string | null; response?: string | null; sender?: string | null }>,
): { productQuery: string } | null {
  const current = String(currentMessage ?? "").trim();
  if (!current) return null;
  if (parseOrdersByLineItemIntent(current)) return null;

  const recentUserMessages = [...history]
    .reverse()
    .map((h) => String(h?.message ?? "").trim())
    .filter(Boolean)
    .slice(-3);
  const priorLineItemAsk = recentUserMessages.some((m) => parseOrdersByLineItemIntent(m) != null);
  const recentAssistantResponses = [...history]
    .reverse()
    .map((h) => String(h?.response ?? "").trim())
    .filter(Boolean)
    .slice(-3);
  const priorDisambiguationPrompt = recentAssistantResponses.some((r) =>
    /multiple product matches|please confirm the exact product/i.test(r),
  );
  if (!priorLineItemAsk && !priorDisambiguationPrompt) return null;

  const looksLikeSku = /^[A-Z]-\d{4,6}$/i.test(current);
  // Accept concise clarification replies, but avoid hijacking unrelated product lookups.
  const looksLikeClarification =
    looksLikeSku ||
    (/^(okay|ok|specifically)\b/i.test(current) && current.length <= 160);
  if (!looksLikeClarification) return null;
  const cleaned = current
    .replace(/^okay[, ]*/i, "")
    .replace(/^specifically[, ]*/i, "")
    .replace(/^specifically\s+/i, "")
    .trim();
  if (!cleaned) return null;
  return { productQuery: cleaned };
}

function formatOrdersByLineItemReply(toolRes: any): string {
  if (toolRes?.error) return String(toolRes.error);

  if (Array.isArray(toolRes?.product_candidates) && toolRes.product_candidates.length > 0) {
    const rows = toolRes.product_candidates
      .slice(0, 10)
      .map((c: any, idx: number) => `| ${idx + 1} | ${String(c?.product_name ?? "N/A")} | ${String(c?.sku ?? "N/A")} |`)
      .join("\n");
    return (
      `I found multiple product matches. Please confirm the exact product.\n\n` +
      `| # | Product | SKU |\n|---|---|---|\n${rows}`
    );
  }

  const productName = String(toolRes?.product?.product_name ?? toolRes?.product?.sku ?? "Product");
  const orders = Array.isArray(toolRes?.orders) ? toolRes.orders : [];
  if (!orders.length) {
    return (
      `I checked your accessible ERP scope and found no orders containing **${productName}** as a line item.\n\n` +
      `If helpful, I can search by a specific SKU or broaden the time window for this product.`
    );
  }

  const rows = orders
    .slice(0, CHAT_ORDER_LIST_TABLE_MAX)
    .map(
      (o: any) =>
        `| ${String(o?.order_number ?? "N/A")} | ${formatDateYmd(o?.order_date)} | ${String(o?.status ?? "N/A")} | ${String(o?.customer_name ?? "N/A")} | ${String(o?.quantity ?? 0)} | ${formatINR(o?.line_total)} |`,
    )
    .join("\n");
  return (
    `Here are orders containing **${productName}** as a line item.\n\n` +
    `| Order Number | Order Date | Status | Distributor | Quantity | Line Total |\n` +
    `|---|---|---|---|---:|---:|\n` +
    `${rows}`
  );
}

function formatVagueRecentOrdersReply(
  orders: unknown[],
  message: string,
  profile: UserProfile,
  includeAllRows = false,
): string {
  if (!orders.length) {
    if (profile.role === "distributor") {
      return (
        "I could not find any ERP orders for your profile in the current scope.\n\n" +
        "If this is unexpected, please confirm your company has **erp_account_id** (or **erp_account_ids**) configured so orders map correctly to **ACCOUNT_MASTER** in ERP."
      );
    }
    return (
      "I checked ERP and found no recent orders in your current access scope.\n\n" +
      "If you want, I can also check a wider date range or verify account mapping."
    );
  }
  const lower = message.toLowerCase();
  let rows = orders as Array<{
    order_number?: string;
    status?: string;
    created_at?: string;
    expected_delivery_date?: string | null;
    customer_name?: string | null;
    order_value?: number | null;
    total_amount?: number | null;
    order_amount?: number | null;
    Total_Order_Amount?: number | null;
  }>;
  if (/last\s+week/.test(lower)) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    rows = rows.filter((o) => {
      const d = new Date(String(o?.created_at ?? ""));
      return !Number.isNaN(d.getTime()) && d >= cutoff;
    });
  }
  if (!rows.length) {
    return (
      "I could not find orders in that date window.\n\n" +
      "Try **recent orders** without a date filter, or share a specific **order number** and I will fetch it directly."
    );
  }
  const deduped = dedupeOrdersByNumber(rows);
  const slice = includeAllRows ? deduped : deduped.slice(0, CHAT_ORDER_LIST_TABLE_MAX);
  const nameColumnLabel = profile.role === "distributor" ? "Customer Name" : "Distributor Name";
  const table = slice
    .map(
      (o) => {
        const valStr = formatOrderValueForChat(o);
        const nameValue =
          o?.customer_name ??
          (o as { distributor_name?: string | null })?.distributor_name ??
          (o as { company_name?: string | null })?.company_name ??
          "N/A";
        return `| ${String(o?.order_number ?? "N/A")} | ${String(o?.status ?? "N/A")} | ${formatDateYmd(o?.created_at)} | ${String(nameValue)} | ${valStr} |`;
      },
    )
    .join("\n");
  const totalLine = includeAllRows ? `Total orders: **${deduped.length}**.\n\n` : "";
  return (
    `Here are your recent orders from ERP.\n\n` +
      `${totalLine}` +
      `| Order Number | Status | Order Date | ${nameColumnLabel} | Order Value |\n|---|---|---|---|---|\n${table}\n\n` +
      `Reply with an **order number** for full status, or ask about a **product line**.`
  );
}

function orderLifecycleSequence(): string[] {
  return [
    "ORDER_RECEIVED",
    "ALLOCATED_LOCAL_WAREHOUSE",
    "ALLOCATED_CENTRAL_WAREHOUSE",
    "IN_PREPARATION",
    "AWAITING_FACTORY",
    "DISPATCH_READY",
    "DELIVERED",
  ];
}

function prettifyLifecycleStatus(statusRaw: string): string {
  const key = String(statusRaw ?? "").trim().toUpperCase();
  const map: Record<string, string> = {
    ORDER_RECEIVED: "Order Received",
    ALLOCATED_LOCAL_WAREHOUSE: "Allocated Local Warehouse",
    ALLOCATED_CENTRAL_WAREHOUSE: "Allocated Central Warehouse",
    IN_PREPARATION: "In Preparation",
    AWAITING_FACTORY: "Awaiting Factory",
    DISPATCH_READY: "Dispatch Ready",
    DELIVERED: "Delivered",
  };
  return map[key] ?? key.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function deriveLifecycleProgress(statusRaw: unknown): { previous: string; current: string } {
  const seq = orderLifecycleSequence();
  const cur = String(statusRaw ?? "").trim().toUpperCase();
  const idx = seq.indexOf(cur);
  if (idx < 0) return { previous: "Not available", current: prettifyLifecycleStatus(cur || "N/A") };
  const prev =
    idx === 0
      ? "None (first stage)"
      : seq
          .slice(0, idx)
          .map((s) => prettifyLifecycleStatus(s))
          .join(" -> ");
  return { previous: prev, current: prettifyLifecycleStatus(seq[idx]) };
}

async function formatDeterministicOrderStatusReply(orderNumber: string, profile: UserProfile): Promise<string> {
  const orderRes = await executeTool("getOrderStatus", { orderNumber }, profile);
  if (orderRes && typeof orderRes === "object" && (orderRes as { error?: string }).error) {
    return ensureSafeReply(String((orderRes as { error: string }).error));
  }
  const r = orderRes as Record<string, unknown>;
  const lane = r.lane_a as Record<string, unknown> | undefined;
  const orderNo = String(r.order_number ?? orderNumber);
  const status = String(r.status ?? r.order_status ?? "N/A");
  const cust = String(r.customer_name ?? "N/A");
  const ext = String(lane?.external_status ?? status ?? "");
  const isDelivered = ext === "DELIVERED" || String(status).toUpperCase() === "DELIVERED";
  const deliveryDate = formatDateYmd(r.delivery_date ?? lane?.date_of_removal);
  const expectedDeliveryYmd = formatDateYmd(r.expected_delivery_date);
  const expl = lane?.explanation ? String(lane.explanation) : "";
  const nextUp = lane?.next_update_by ? formatDateYmd(lane.next_update_by) : null;
  let deliveryWindowLabel = "";
  const lifecycle = deriveLifecycleProgress(status);
  let previousOrdersLabel = "Not available";
  try {
    const scopedOrders = await getOrdersForRole(profile);
    const currentOrderDateRaw = r.created_at ?? r.order_date ?? null;
    const currentOrderDate = currentOrderDateRaw ? new Date(String(currentOrderDateRaw)) : null;
    const currentOrderNo = String(r.order_number ?? orderNumber).trim();
    const currentDistributor = String(r.customer_name ?? "").trim().toLowerCase();
    if (currentOrderDate && !Number.isNaN(currentOrderDate.getTime()) && currentDistributor) {
      const prev = (Array.isArray(scopedOrders) ? scopedOrders : [])
        .filter((o: any) => String(o?.order_number ?? "").trim() !== currentOrderNo)
        .filter((o: any) => String(o?.customer_name ?? "").trim().toLowerCase() === currentDistributor)
        .filter((o: any) => {
          const d = new Date(String(o?.created_at ?? o?.order_date ?? ""));
          return !Number.isNaN(d.getTime()) && d < currentOrderDate;
        })
        .sort((a: any, b: any) => {
          const da = new Date(String(a?.created_at ?? a?.order_date ?? ""));
          const db = new Date(String(b?.created_at ?? b?.order_date ?? ""));
          return db.getTime() - da.getTime();
        })
        .slice(0, 3);
      if (prev.length) {
        previousOrdersLabel = prev.map((o: any) => String(o?.order_number ?? "N/A")).join(", ");
      } else {
        previousOrdersLabel = "No earlier orders found for this distributor";
      }
    }
  } catch {
    // Keep response resilient if scoped order lookup fails.
  }
  const eb =
    (lane?.expected_delivery_band as { label?: unknown } | undefined) ??
    (lane?.eta_band as { label?: unknown } | undefined);
  if (eb && typeof eb === "object" && eb.label != null) {
    deliveryWindowLabel = String((eb as { label: string }).label);
  }

  let out =
    `Here is what ERP shows for sales order ${orderNo} (internal id ${String(r.sales_order_id ?? "—")}).\n\n` +
    `| Field | Value |\n|---|---|\n` +
    `| Status | ${status} |\n` +
    `| Previous transitions | ${previousOrdersLabel} |\n` +
    `| Current delivery stage | ${lifecycle.current} |\n` +
    `| Distributor | ${cust} |\n`;

  if (isDelivered) {
    out += `| Delivery date (ERP) | ${deliveryDate !== "N/A" ? deliveryDate : "Not recorded — check linked invoices"} |\n`;
    out += `| Expected delivery (indicative) | Not applicable (delivered) |\n`;
    if (deliveryWindowLabel) out += `| Delivery summary | ${deliveryWindowLabel} |\n`;
    out += `| Next update | Not applicable (delivered) |\n\n`;
  } else {
    out += `| Expected delivery (indicative) | ${expectedDeliveryYmd} |\n`;
    if (deliveryWindowLabel) out += `| Expected delivery window | ${deliveryWindowLabel} |\n`;
    out += `| Next update (indicative) | ${nextUp ?? "—"} |\n\n`;
  }

  if (expl) out += `${expl}\n\n`;
  out += `Linked invoices: ${Number(r.invoice_count ?? 0)}.\n\n`;
  out += `Ask for line items, invoices, or another order number if you need more detail.`;
  return ensureSafeReply(out);
}

function formatDeterministicOrderDrilldownReply(orderNumber: string, drilldownRes: unknown): string {
  const r = drilldownRes as Record<string, unknown>;
  if (typeof r.error === "string" && r.error.trim()) return ensureSafeReply(r.error);
  const orderNo = String(r.order_number ?? orderNumber);
  const status = String(r.status ?? r.order_status ?? "N/A");
  const expectedDelivery = formatDateYmd(r.expected_delivery_date);
  const items = Array.isArray(r.items) ? (r.items as Array<Record<string, unknown>>) : [];

  let out =
    `Here is the ERP drilldown for sales order ${orderNo}.\n\n` +
    `| Field | Value |\n|---|---|\n` +
    `| Status | ${status} |\n` +
    `| Expected delivery (indicative) | ${expectedDelivery} |\n\n`;

  if (!items.length) return `${out}${ORDER_LINES_NOT_POSTED_REPLY}`;

  let lineTotalSum = 0;
  const rows = items
    .slice(0, 100)
    .map((it, idx) => {
      const product = String(it.product_name ?? "Item");
      const sku = displayOrderLineSku(it as Record<string, unknown>);
      const qty = Number(it.quantity ?? it.ordered ?? 0);
      const lineTotalNumber = it.line_total == null ? null : Number(it.line_total);
      if (lineTotalNumber != null && Number.isFinite(lineTotalNumber)) lineTotalSum += lineTotalNumber;
      const lineTotal = formatINR(lineTotalNumber);
      return `| ${idx + 1} | ${product} | ${sku} | ${qty} | ${lineTotal} |`;
    })
    .join("\n");

  out += `| # | Product | SKU | Qty | Line Total |\n|---:|---|---|---:|---:|\n${rows}`;
  out += `\n\nLine total sum: ${formatINR(lineTotalSum)}.`;
  if (r.invoice_count != null) out += `\nLinked invoices: ${Number(r.invoice_count)}.`;
  return ensureSafeReply(out);
}

async function ensureChatSession(supabase: any, userId: number) {
  const { data: existing } = await supabase.from("chatbot_sessions").select("session_id").eq("user_id", userId).order("session_id", { ascending: false }).limit(1);
  if (existing?.[0]) return existing[0].session_id;
  const { data: inserted } = await supabase.from("chatbot_sessions").insert({ user_id: userId }).select("session_id").single();
  return inserted.session_id;
}
