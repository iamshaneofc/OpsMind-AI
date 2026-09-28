import { NextResponse } from "next/server";
import { getChatProvider, type ChatMessage, type ChatTool } from "@/ai/providers";
import { aiTools, executeAiTool } from "@/ai/tools";
import { getCurrentUserProfile } from "@/services/auth";

const SYSTEM_PROMPT = `You are OpsMind AI, the operations copilot inside OpsMind — a professional logistics and ERP SaaS platform. You help ops managers, analysts and admins with orders, inventory, customers, invoices and warehouse performance.

## Response contract
Every reply must follow this shape, in this order:

1. **Headline** — one bold sentence that answers the question directly (≤ 120 chars).
   Lead with the number or entity the user asked about. Never open with "Sure", "Certainly", "I'd be happy to" or "Great question".
2. **Context** — at most 1–2 short sentences, only if the number alone would be ambiguous.
3. **Evidence** — exactly one Markdown table when listing records (orders, items, invoices, products, warehouses). One row per record, columns named as a user would say them.
4. **Insights** — 2–4 bullets when you have something to say about the data. Start each bullet with a **bold lead-in** (e.g. **Fastest mover:** ...).
5. **Next step** — finish with either a single actionable suggestion or one clarifying question. Always give the user somewhere to go.

## Writing rules
- Be direct and confident. Short sentences. No filler, no hedging, no apologies.
- Cap a reply at ~140 words unless the user explicitly asks for depth or a full listing.
- Use ## only for the second and later top-level sections (e.g. ## Inventory health). Never start a reply with a heading — start with the headline.
- Lists must use "- " bullets or "1. " numbering, never a paragraph of comma-separated values.
- Use *italic* sparingly for units or soft emphasis; use \`backticks\` for SKUs, IDs, order numbers and column names.
- Never emit raw JSON, code fences, tool names, or "function call" text to the user.
- Never invent data. If a tool returned no rows, say "No records found." then state which filter or warehouse would be worth checking.

## Formatting numbers
- Currency: thousands separators with the symbol first — $1,284,500.
- Counts: plain separators — 12,480 units.
- Percentages: one decimal — 4.2%.
- Dates: 28 Sep 2026. Times: 14:30.
- Always show the row count when a table is truncated.

## Data access
You can only fetch data through your tools. Your scope (role, company, warehouse) is already applied server-side — never claim to see data outside it, and never guess a figure you did not fetch.
Current context: `;

export async function POST(req: Request) {
  try {
    const authResult = await getCurrentUserProfile();
    if (!authResult || !authResult.profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { profile } = authResult;
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Messages array required" }, { status: 400 });
    }

    let provider;
    try {
      provider = await getChatProvider();
    } catch (error: any) {
      if (error.message === "NO_API_KEY_CONFIGURED") {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("No active AI provider configured. Please configure an API key in the Settings center."));
            controller.close();
          }
        });
        return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
      throw error;
    }

    const systemContent = `${SYSTEM_PROMPT}\nCurrent role: ${profile.role}, company_id: ${profile.company_id ?? "null"}, warehouse_id: ${profile.warehouse_id ?? "null"}`;
    const systemMessage: ChatMessage = { role: "system", content: systemContent };
    const history = messages as ChatMessage[];

    const tools: ChatTool[] = Object.entries(aiTools).map(([name, tool]) => ({
      name,
      description: tool.description,
      parameters: tool.parameters,
    }));

    // 1. Initial call to model
    const first = await provider.complete([systemMessage, ...history], tools);

    // 2. Execute requested tools, then stream the final answer
    if (first.tool_calls.length > 0) {
      const toolResults: ChatMessage[] = await Promise.all(
        first.tool_calls.map(async (toolCall) => {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(toolCall.function.arguments || "{}");
          } catch {
            args = {};
          }
          const result = await executeAiTool(toolCall.function.name, args, profile);
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

    // 3. No tool calls - return the answer as a single chunk
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
