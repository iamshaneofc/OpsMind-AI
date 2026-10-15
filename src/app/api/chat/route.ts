import { getChatProvider, type ChatMessage, type ChatTool } from "@/ai/providers";
import { aiTools, executeAiTool } from "@/ai/tools";
import { getCurrentUserProfile } from "@/services/auth";
import { buildIndustryPromptBlock, getIndustryMeta } from "@/lib/industry";
import { getActiveIndustry } from "@/lib/industry-server";

const SYSTEM_PROMPT = `You are OpsMind AI, the operations copilot inside OpsMind — a professional B2B distribution and ERP operations platform. You help ops managers, analysts and admins with orders, inventory, customers, invoices and warehouse performance.

## Response contract
Every reply must follow this shape, in this order:

1. **Headline** — start with one bold sentence using **double asterisks** (≤ 120 chars). Example: **12 delayed orders need chase today.**
   Lead with the number or entity the user asked about. Never open with a Markdown heading (### / ##), and never open with "Sure", "Certainly", "I'd be happy to" or "Great question".
2. **Context** — at most 1–2 short sentences, only if the number alone would be ambiguous.
3. **Evidence** — exactly one Markdown table when listing records (orders, items, invoices, products, warehouses). One row per record, columns named as a user would say them.
4. **Insights** — 2–4 bullets when you have something to say about the data. Start each bullet with a **bold lead-in** (e.g. **Fastest mover:** ...).
5. **Next step** — finish with either a single actionable suggestion or one clarifying question. Always give the user somewhere to go.

## Writing rules
- Be direct and confident. Short sentences. No filler, no hedging, no apologies.
- Sound like a sharp ops lead in a live warehouse standup — concrete names, SKUs, hubs, ₹ amounts.
- Cap a reply at ~160 words unless the user explicitly asks for depth or a full listing.
- Prefer tool fields already formatted (amountFormatted, daysLate, onHand, sku).
- When listing, show at most 8 table rows; say how many more exist if count is higher.
- Use ## only for the second and later top-level sections. Never start a reply with a heading — start with the headline.
- Lists must use "- " bullets or "1. " numbering.
- Use \`backticks\` for SKUs, IDs, and order numbers.
- Never emit raw JSON, code fences, tool names, or "function call" text to the user.
- Never invent data. If a tool returned no rows, say "No records found." then suggest a concrete follow-up (order id, hub name, or tip).

## Tool habits
- For hub questions ("Mumbai Hub", "Western Region Hub"), call getWarehouseInventory with warehouseName (or listWarehouses first).
- For "Bharat Fine Chemicals" / named accounts, use getCustomerHistory with customerName.
- For "what should I do today", call getOperationalTips.
- For vague asks, pick the highest-value tool (delayed / overdue / low stock / tips) and answer.

## Formatting numbers
- Use amountFormatted / totalValuationFormatted / currencySymbol from tools when present.
- Counts: plain separators — 12,480.
- Percentages: one decimal — 4.2%.
- Dates: 28 Sep 2026.
- Always show the row count when a table is truncated.

## Data access
You can only fetch data through your tools. Scope (role, warehouse, industry) is applied server-side — never invent figures.
`;

export async function POST(req: Request) {
  try {
    const authResult = await getCurrentUserProfile();
    if (!authResult || !authResult.profile) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { profile } = authResult;
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return Response.json({ error: "Messages array required" }, { status: 400 });
    }

    const industry = getActiveIndustry();
    const meta = getIndustryMeta(industry);

    let provider;
    try {
      provider = await getChatProvider();
    } catch (error: any) {
      if (error.message === "NO_API_KEY_CONFIGURED") {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                "No active AI provider configured. Please configure an API key in the Settings center.",
              ),
            );
            controller.close();
          },
        });
        return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
      throw error;
    }

    const systemContent = `${SYSTEM_PROMPT}
${buildIndustryPromptBlock(industry)}

Current role: ${profile.role}, company_id: ${profile.company_id ?? "null"}, warehouse_id: ${profile.warehouse_id ?? "null"}, industry: ${industry}, company: ${meta.companyName}.
Currency symbol: ${meta.currencySymbol}. Units: ${meta.unit}.`;

    const systemMessage: ChatMessage = { role: "system", content: systemContent };
    const history = messages as ChatMessage[];

    const tools: ChatTool[] = Object.entries(aiTools).map(([name, tool]) => ({
      name,
      description: tool.description,
      parameters: tool.parameters,
    }));

    const first = await provider.complete([systemMessage, ...history], tools);

    if (first.tool_calls.length > 0) {
      const toolResults: ChatMessage[] = await Promise.all(
        first.tool_calls.map(async (toolCall) => {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(toolCall.function.arguments || "{}");
          } catch {
            args = {};
          }
          const result = await executeAiTool(toolCall.function.name, args, profile, industry);
          return {
            role: "tool" as const,
            tool_call_id: toolCall.id,
            content: typeof result === "string" ? result : JSON.stringify(result),
          };
        }),
      );

      const stream = await provider.stream([
        systemMessage,
        ...history,
        { role: "assistant", content: first.content, tool_calls: first.tool_calls },
        ...toolResults,
      ]);

      return new Response(stream, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const readableStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(first.content || ""));
        controller.close();
      },
    });

    return new Response(readableStream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error: any) {
    console.error("Chat API Error:", error);
    return new Response("Unable to process request right now. Please try again.", { status: 500 });
  }
}
