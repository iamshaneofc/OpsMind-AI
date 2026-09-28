import { describe, expect, it, vi } from "vitest";

// providers.ts reads AiProviderConfig at call time; stub Prisma so importing it
// never touches a real database connection.
vi.mock("@/lib/db", () => ({ prisma: {} }));

import {
  hasPlausibleKeyFormat,
  isProviderName,
  modelFor,
  splitSystem,
  toAnthropicMessages,
  fromAnthropicBlocks,
  toGeminiContents,
  type ChatMessage,
} from "./providers";

describe("splitSystem", () => {
  it("extracts the system prompt and drops it from the conversation", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "You are OpsMind AI." },
      { role: "user", content: "How many orders?" },
    ];
    const { system, rest } = splitSystem(messages);
    expect(system).toBe("You are OpsMind AI.");
    expect(rest).toHaveLength(1);
    expect(rest[0].role).toBe("user");
  });

  it("joins multiple system turns", () => {
    const { system } = splitSystem([
      { role: "system", content: "Rules A" },
      { role: "user", content: "hi" },
      { role: "system", content: "Rules B" },
    ]);
    expect(system).toBe("Rules A\n\nRules B");
  });
});

describe("toAnthropicMessages", () => {
  it("maps plain user and assistant turns", () => {
    const out = toAnthropicMessages([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ]);
    expect(out).toEqual([
      { role: "user", content: "hello" },
      // Assistant turns are always block arrays so tool_use can be appended.
      { role: "assistant", content: [{ type: "text", text: "hi there" }] },
    ]);
  });

  it("turns assistant tool_calls into tool_use blocks", () => {
    const out = toAnthropicMessages([
      { role: "user", content: "orders?" },
      {
        role: "assistant",
        content: "Checking.",
        tool_calls: [
          { id: "call_1", type: "function", function: { name: "get_orders", arguments: '{"limit":5}' } },
        ],
      },
    ]);
    expect(out).toHaveLength(2);
    const blocks = out[1].content as Array<Record<string, unknown>>;
    expect(blocks.map((b) => b.type)).toEqual(["text", "tool_use"]);
    expect(blocks[1]).toMatchObject({ id: "call_1", name: "get_orders", input: { limit: 5 } });
  });

  it("prefixes a user turn when the history does not start with one", () => {
    const out = toAnthropicMessages([
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "a", type: "function", function: { name: "x", arguments: "{}" } }],
      },
      { role: "tool", tool_call_id: "a", content: "1" },
    ]);
    expect(out[0]).toEqual({ role: "user", content: "Continue." });
    expect(out).toHaveLength(3);
  });

  it("groups tool results onto a following user turn", () => {
    const out = toAnthropicMessages([
      { role: "user", content: "orders?" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call_1", type: "function", function: { name: "get_orders", arguments: "{}" } },
        ],
      },
      { role: "tool", tool_call_id: "call_1", content: '[{"order_number":"ORD-1"}]' },
    ]);
    // A leading user turn keeps the fabricated sentinel out of the transcript.
    expect(out[0]).toEqual({ role: "user", content: "orders?" });
    expect(out[1].role).toBe("assistant");
    expect(out[2].role).toBe("user");
    const blocks = out[2].content as Array<Record<string, unknown>>;
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "tool_result", tool_use_id: "call_1" });
  });

  it("merges consecutive tool results into one user turn", () => {
    const out = toAnthropicMessages([
      { role: "user", content: "compare x and y" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "a", type: "function", function: { name: "x", arguments: "{}" } },
          { id: "b", type: "function", function: { name: "y", arguments: "{}" } },
        ],
      },
      { role: "tool", tool_call_id: "a", content: "1" },
      { role: "tool", tool_call_id: "b", content: "2" },
    ]);
    expect(out).toHaveLength(3);
    const blocks = out[2].content as Array<Record<string, unknown>>;
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b.tool_use_id)).toEqual(["a", "b"]);
  });

  it("never produces an empty conversation", () => {
    expect(toAnthropicMessages([])[0]).toEqual({ role: "user", content: "Continue." });
  });
});

describe("fromAnthropicBlocks", () => {
  it("joins text blocks and returns no tool calls", () => {
    const out = fromAnthropicBlocks([
      { type: "text", text: "**Fulfillment" },
      { type: "text", text: " is 94%.**" },
    ]);
    expect(out.content).toBe("**Fulfillment is 94%.**");
    expect(out.tool_calls).toEqual([]);
  });

  it("maps tool_use blocks to OpenAI-shaped tool calls", () => {
    const out = fromAnthropicBlocks([
      { type: "text", text: "Fetching." },
      { type: "tool_use", id: "t1", name: "get_inventory", input: { warehouse: "A" } },
    ]);
    expect(out.tool_calls).toEqual([
      { id: "t1", type: "function", function: { name: "get_inventory", arguments: '{"warehouse":"A"}' } },
    ]);
  });

  it("returns null content when only tool blocks are present", () => {
    const out = fromAnthropicBlocks([{ type: "tool_use", id: "t1", name: "x", input: {} }]);
    expect(out.content).toBeNull();
  });
});

describe("toGeminiContents", () => {
  it("maps user turns and prefixes a user message when empty", () => {
    expect(toGeminiContents([])[0]).toEqual({ role: "user", parts: [{ text: "Continue." }] });
    expect(toGeminiContents([{ role: "user", content: "hi" }])).toEqual([
      { role: "user", parts: [{ text: "hi" }] },
    ]);
  });

  it("maps assistant tool_calls to functionCall parts", () => {
    const out = toGeminiContents([
      { role: "user", content: "how many orders?" },
      {
        role: "assistant",
        content: "Checking.",
        tool_calls: [{ id: "c1", type: "function", function: { name: "get_orders", arguments: '{"limit":2}' } }],
      },
    ]);
    expect(out[1].role).toBe("model");
    expect(out[1].parts).toEqual([
      { text: "Checking." },
      { functionCall: { name: "get_orders", args: { limit: 2 } } },
    ]);
  });

  it("maps tool results to functionResponse parts", () => {
    const out = toGeminiContents([
      { role: "tool", tool_call_id: "get_orders", content: '{"count":3}' },
    ]);
    expect(out[0].parts[0]).toEqual({
      functionResponse: { name: "get_orders", response: { count: 3 } },
    });
  });

  it("does not throw on malformed tool payloads", () => {
    const out = toGeminiContents([{ role: "tool", tool_call_id: "x", content: "not-json" }]);
    expect(out[0].parts[0]).toMatchObject({ functionResponse: { response: { value: "not-json" } } });
  });
});

describe("provider metadata", () => {
  it("recognises supported provider names only", () => {
    expect(isProviderName("OpenAI")).toBe(true);
    expect(isProviderName("Anthropic")).toBe(true);
    expect(isProviderName("Gemini")).toBe(true);
    expect(isProviderName("Claude")).toBe(false);
    expect(isProviderName(undefined)).toBe(false);
  });

  it("validates key prefixes per provider", () => {
    expect(hasPlausibleKeyFormat("OpenAI", "sk-abc")).toBe(true);
    expect(hasPlausibleKeyFormat("OpenAI", "AIzaabc")).toBe(false);
    expect(hasPlausibleKeyFormat("Anthropic", "sk-ant-abc")).toBe(true);
    expect(hasPlausibleKeyFormat("Anthropic", "sk-abc")).toBe(false);
    expect(hasPlausibleKeyFormat("Gemini", "AIzaSyKey")).toBe(true);
    expect(hasPlausibleKeyFormat("Gemini", "sk-abc")).toBe(false);
    expect(hasPlausibleKeyFormat("OpenAI", "   ")).toBe(false);
  });

  it("defaults to a stable model per provider", () => {
    expect(modelFor("OpenAI")).toBeTruthy();
    expect(modelFor("Anthropic")).toBeTruthy();
    expect(modelFor("Gemini")).toBeTruthy();
  });
});
