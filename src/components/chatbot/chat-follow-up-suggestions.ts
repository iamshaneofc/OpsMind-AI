import type { AppRole } from "@/types/auth";

/** ERP-style order voucher (e.g. 8.105.260217.16) */
function extractOrderNumbers(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /\b(\d+\.\d+\.\d+\.\d+(?:\.\d+)?)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = m[1];
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

export type ChatTurn = { role: string; content: string };

/** Starters when there is no prior context (empty thread or still loading). */
export function getRoleStarters(role: AppRole): string[] {
  if (role === "distributor") {
    return ["Track my order", "Show my pending orders", "Show delayed orders"];
  }
  if (role === "warehouse") {
    return ["Show dispatch queue", "Check inventory for my warehouse", "Show low stock products"];
  }
  return ["Show delayed orders", "Show dispatch queue", "Check inventory across warehouses", "Track an order"];
}

function recentTextsLower(recentUserTexts: string[] | undefined, fallback: string): string[] {
  const raw = recentUserTexts?.length ? recentUserTexts : [fallback];
  return raw.map((t) => t.trim().toLowerCase()).filter(Boolean);
}

function recentMatches(recentLower: string[], re: RegExp): boolean {
  return recentLower.some((t) => re.test(t));
}

/**
 * Suggestion chips for the composer (empty input). Uses the latest completed user→assistant turn
 * when available, otherwise role starters.
 */
export function getComposerSuggestionChips(messages: ChatTurn[], role: AppRole, loading: boolean): string[] {
  if (loading) {
    return getRoleStarters(role);
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant" && messages[i].content.trim()) {
      let prevUser: string | null = null;
      for (let j = i - 1; j >= 0; j--) {
        if (messages[j].role === "user") {
          prevUser = messages[j].content;
          break;
        }
      }
      if (prevUser) {
        const recentUserTexts = messages
          .filter((m) => m.role === "user")
          .map((m) => m.content.trim())
          .filter(Boolean)
          .slice(-6);
        return computeFollowUpSuggestions(prevUser, messages[i].content, role, { recentUserTexts });
      }
    }
  }
  return getRoleStarters(role);
}

export type FollowUpOptions = { recentUserTexts?: string[] };

/**
 * Contextual follow-ups after the last exchange (no extra API call).
 * Pass recent user messages from the thread to avoid repeating what was already asked.
 */
export function computeFollowUpSuggestions(
  lastUserMessage: string,
  lastAssistantMessage: string,
  role: AppRole,
  options?: FollowUpOptions,
): string[] {
  const user = lastUserMessage.trim();
  const assistant = lastAssistantMessage.trim();
  const combined = `${user} ${assistant}`;
  const lower = combined.toLowerCase();

  const recentLower = recentTextsLower(options?.recentUserTexts, user);

  const suggestions: string[] = [];

  const orders = extractOrderNumbers(assistant);
  const primaryOrder = orders[0];

  const looksDelivered =
    /\bDELIVERED\b/i.test(assistant) ||
    /"external_status"\s*:\s*"DELIVERED"/.test(assistant) ||
    /\*\*Status\*\*:\s*DELIVERED\b/i.test(assistant) ||
    /\bstatus\s*:\s*delivered\b/i.test(assistant) ||
    /\border status[:\s\-–]+delivered\b/i.test(assistant) ||
    /\bcompleted in erp\b/i.test(assistant) ||
    /no forward estimated delivery/i.test(assistant) ||
    /not applicable[^\n]{0,80}completed/i.test(assistant) ||
    /order (is )?already completed/i.test(assistant) ||
    /order shows completed/i.test(assistant);

  const userAskedExpectedDelivery = /expected\s+delivery|what (is|’|')s? the (expected )?delivery|order.*\bdeliver/i.test(
    user,
  );
  const recentAskedExpectedDelivery = recentMatches(
    recentLower,
    /expected\s+delivery|\bdelivery date\b|when\s+will.*(deliver|arrive)/i,
  );

  if (primaryOrder) {
    const ordEsc = primaryOrder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const recentAskedLineItems = recentMatches(recentLower, /line items|detailed line|breakdown/i);
    const recentAskedInvoices = recentMatches(recentLower, /invoice/i);
    const recentMentionedOrder = recentMatches(recentLower, new RegExp(ordEsc));

    if (!(recentAskedLineItems && recentMentionedOrder)) {
      suggestions.push(`Show detailed line items for order ${primaryOrder}`);
    }
    if (!(recentAskedInvoices && recentMentionedOrder)) {
      suggestions.push(`List all invoices for order ${primaryOrder}`);
    }
    if (!looksDelivered && !userAskedExpectedDelivery && !recentAskedExpectedDelivery) {
      suggestions.push(`What is the expected delivery date for order ${primaryOrder}?`);
    }
  }

  if (looksDelivered && primaryOrder) {
    suggestions.push("Track another order");
    if (!recentMatches(recentLower, /today'?s?\s+invoices|invoices for today/i)) {
      suggestions.push("Show today's invoices");
    }
  }

  if (/order|track|status|dispatch|delivery|sales order|pending/i.test(lower)) {
    if (role === "distributor") {
      if (!recentMatches(recentLower, /pending orders/i)) suggestions.push("Show my pending orders");
      if (!recentMatches(recentLower, /delayed orders/i)) suggestions.push("Show delayed orders");
    } else {
      if (!recentMatches(recentLower, /dispatch queue/i)) suggestions.push("Show dispatch queue");
      if (!recentMatches(recentLower, /delayed orders/i)) suggestions.push("Show delayed orders");
      if (!recentMatches(recentLower, /distributors/i)) suggestions.push("List distributors");
    }
  }

  if (/invoice|tax invoice|billing|gst/i.test(lower)) {
    if (!recentMatches(recentLower, /today'?s?\s+invoices|invoices for today/i)) {
      suggestions.push("Show today's invoices");
    }
    if (role !== "distributor" && !recentMatches(recentLower, /delayed invoices/i)) {
      suggestions.push("Show delayed invoices");
    }
  }

  if (/inventory|stock|low stock|reorder|warehouse/i.test(lower)) {
    if (!recentMatches(recentLower, /low stock/i)) suggestions.push("Show low stock products");
    if (role === "warehouse" && !recentMatches(recentLower, /my warehouse|warehouse inventory/i)) {
      suggestions.push("Show inventory for my warehouse");
    }
    if ((role === "super_admin" || role === "distributor") && !recentMatches(recentLower, /across warehouses|all warehouses/i)) {
      suggestions.push("Show inventory across warehouses");
    }
  }

  if (suggestions.length < 3) {
    const pad = getRoleStarters(role).filter((s) => {
      const sl = s.toLowerCase();
      return !recentLower.some((t) => t.includes(sl));
    });
    for (const p of pad) {
      suggestions.push(p);
      if (suggestions.length >= 6) break;
    }
  }

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const s of suggestions) {
    const t = s.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    deduped.push(t);
    if (deduped.length >= 6) break;
  }

  const suppressExpectedDeliveryChip =
    looksDelivered ||
    userAskedExpectedDelivery ||
    recentAskedExpectedDelivery ||
    /\bnot applicable[^\n]{0,120}completed\b/i.test(assistant) ||
    /\border status\b[^\n]{0,40}\bdelivered\b/i.test(assistant) ||
    /\b-?order status\b[^\n]{0,40}\bdelivered\b/i.test(assistant);

  const filtered = deduped.filter((s) => {
    if (suppressExpectedDeliveryChip && /expected delivery date for order/i.test(s)) return false;
    return true;
  });

  return filtered.slice(0, 5);
}
