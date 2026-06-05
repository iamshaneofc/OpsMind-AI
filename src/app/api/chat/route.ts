import { NextResponse } from "next/server";
import { getOpenAIClient } from "@/ai/openai";
import { aiTools, executeAiTool } from "@/ai/tools";
import { getCurrentUserProfile } from "@/services/auth";

const SYSTEM_PROMPT = `You are OpsMind AI, a generic AI Operations Copilot for managing orders, inventory, customers, and invoices.
You have tools to fetch data from the PostgreSQL database.
ALWAYS format your answers cleanly using Markdown tables when listing data (orders, items, invoices, products).
When the user asks for information, use the appropriate tool to fetch it, then present it clearly.`;

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

    let openai;
    try {
      openai = await getOpenAIClient();
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

    // 1. Initial call to model
    const initialResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { 
          role: "system", 
          content: `${SYSTEM_PROMPT}\nCurrent role: ${profile.role}, company_id: ${profile.company_id ?? "null"}, warehouse_id: ${profile.warehouse_id ?? "null"}` 
        },
        ...messages
      ],
      tools: Object.entries(aiTools).map(([name, tool]) => ({
        type: "function",
        function: { name, description: tool.description, parameters: tool.parameters }
      })),
      tool_choice: "auto",
    });

    const responseMessage = initialResponse.choices[0].message;

    // 2. Handle Tool Calls
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      const toolResults = await Promise.all(
        responseMessage.tool_calls.map(async (toolCall: any) => {
          const args = JSON.parse(toolCall.function.arguments);
          const result = await executeAiTool(toolCall.function.name, args, profile);
          return {
            role: "tool",
            tool_call_id: toolCall.id,
            content: typeof result === 'string' ? result : JSON.stringify(result)
          };
        })
      );

      // 3. Second call with tool results, streaming the final answer
      const stream = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { 
            role: "system", 
            content: `${SYSTEM_PROMPT}\nCurrent role: ${profile.role}, company_id: ${profile.company_id ?? "null"}, warehouse_id: ${profile.warehouse_id ?? "null"}` 
          },
          ...messages,
          responseMessage,
          ...(toolResults as any)
        ],
        stream: true,
      });

      const readableStream = new ReadableStream({
        async start(controller) {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content || "";
            if (text) controller.enqueue(new TextEncoder().encode(text));
          }
          controller.close();
        }
      });

      return new Response(readableStream, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // 4. No tool calls, just stream a fake single chunk for the frontend
    const readableStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(responseMessage.content || ""));
        controller.close();
      }
    });
    
    return new Response(readableStream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });

  } catch (error: any) {
    console.error("Chat API Error:", error);
    return new Response("Unable to process request right now. Please try again.", { status: 500 });
  }
}
