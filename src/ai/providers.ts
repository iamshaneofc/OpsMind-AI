import OpenAI from "openai";
import { prisma } from "@/lib/db";
import { normalizeApiKey } from "@/ai/api-key";

export type ProviderName = "OpenAI" | "Anthropic" | "Gemini";

export const PROVIDER_NAMES: ProviderName[] = ["OpenAI", "Anthropic", "Gemini"];

const KEY_ENV: Record<ProviderName, string | undefined> = {
  OpenAI: "OPENAI_API_KEY",
  Anthropic: "ANTHROPIC_API_KEY",
  Gemini: "GEMINI_API_KEY",
};

/** Prefix each provider's key is issued with — used by the "Test connection" route. */
const KEY_PREFIX: Record<ProviderName, string[]> = {
  OpenAI: ["sk-"],
  Anthropic: ["sk-ant-"],
  Gemini: ["AIza"],
};

const MODEL_ENV: Record<ProviderName, string | undefined> = {
  OpenAI: "OPENAI_MODEL",
  Anthropic: "ANTHROPIC_MODEL",
  Gemini: "GEMINI_MODEL",
};

const DEFAULT_MODEL: Record<ProviderName, string> = {
  OpenAI: "gpt-4o",
  Anthropic: "claude-3-5-sonnet-latest",
  Gemini: "gemini-2.0-flash",
};

export function isProviderName(value: unknown): value is ProviderName {
  return typeof value === "string" && (PROVIDER_NAMES as string[]).includes(value);
}

export function modelFor(provider: ProviderName): string {
  const fromEnv = MODEL_ENV[provider] ? normalizeApiKey(process.env[MODEL_ENV[provider]!]) : "";
  return fromEnv || DEFAULT_MODEL[provider];
}

/** True when the key carries the issuer prefix for that provider. */
export function hasPlausibleKeyFormat(provider: ProviderName, rawKey: string): boolean {
  const key = normalizeApiKey(rawKey);
  if (!key) return false;
  return KEY_PREFIX[provider].some((prefix) => key.startsWith(prefix));
}

export type ProviderCredentials = { name: ProviderName; apiKey: string; source: "database" | "environment" };

/**
 * Resolve the credential the assistant should use: the active row in
 * AiProviderConfig wins, otherwise the first provider env var that is set.
 * Throws NO_API_KEY_CONFIGURED when nothing is configured.
 */
export async function getActiveProvider(): Promise<ProviderCredentials> {
  try {
    const config = await prisma.aiProviderConfig.findFirst({ where: { isActive: true } });
    if (config && isProviderName(config.provider)) {
      const apiKey = normalizeApiKey(config.apiKey);
      if (apiKey) return { name: config.provider, apiKey, source: "database" };
    }
  } catch (error) {
    // Fall through to environment — a DB hiccup must not block an env-configured key.
    console.error("Provider lookup failed:", error);
  }

  for (const name of PROVIDER_NAMES) {
    const apiKey = normalizeApiKey(KEY_ENV[name] ? process.env[KEY_ENV[name]!] : undefined);
    if (apiKey) return { name, apiKey, source: "environment" };
  }

  throw new Error("NO_API_KEY_CONFIGURED");
}

export type ChatRole = "system" | "user" | "assistant" | "tool";

export type ChatMessage = {
  role: ChatRole;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatTool = { name: string; description: string; parameters: Record<string, unknown> };

export type Completion = { content: string | null; tool_calls: ToolCall[] };

export interface ChatProvider {
  readonly name: ProviderName;
  readonly model: string;
  /** Non-streaming completion, tool-call aware. */
  complete(messages: ChatMessage[], tools: ChatTool[]): Promise<Completion>;
  /** Streaming completion for the final answer (no tools). */
  stream(messages: ChatMessage[]): Promise<ReadableStream<Uint8Array>>;
}

const SYSTEM_ROLE: ChatRole = "system";

export function splitSystem(messages: ChatMessage[]): { system: string; rest: ChatMessage[] } {
  const systemParts = messages.filter((m) => m.role === SYSTEM_ROLE).map((m) => m.content ?? "");
  const rest = messages.filter((m) => m.role !== SYSTEM_ROLE);
  return { system: systemParts.join("\n\n"), rest };
}

/* ────────────────────────── OpenAI ────────────────────────── */

class OpenAiProvider implements ChatProvider {
  readonly name = "OpenAI" as const;
  readonly model: string;

  constructor(private readonly apiKey: string) {
    this.model = modelFor("OpenAI");
  }

  private client() {
    return new OpenAI({ apiKey: this.apiKey, baseURL: "https://api.openai.com/v1" });
  }

  async complete(messages: ChatMessage[], tools: ChatTool[]): Promise<Completion> {
    const client = this.client();
    const res = await client.chat.completions.create({
      model: this.model,
      messages: messages as never,
      tools: tools.map((t) => ({
        type: "function" as const,
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
      tool_choice: "auto",
    });
    const msg = res.choices[0]?.message;
    return { content: msg?.content ?? null, tool_calls: (msg?.tool_calls as ToolCall[]) ?? [] };
  }

  async stream(messages: ChatMessage[]): Promise<ReadableStream<Uint8Array>> {
    const client = this.client();
    const stream = await client.chat.completions.create({
      model: this.model,
      messages: messages as never,
      stream: true,
    });
    return new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content || "";
          if (text) controller.enqueue(new TextEncoder().encode(text));
        }
        controller.close();
      },
    });
  }
}

/* ───────────────────────── Anthropic ───────────────────────── */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 2048;

function anthropicHeaders(apiKey: string) {
  return {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
  };
}

export type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

export type AnthropicContent = string | Array<{ type: string; [k: string]: unknown }>;

/** OpenAI-style messages → Anthropic messages (drops system, folds tool results in). */
export function toAnthropicMessages(messages: ChatMessage[]): Array<{ role: "user" | "assistant"; content: AnthropicContent }> {
  const out: Array<{ role: "user" | "assistant"; content: AnthropicContent }> = [];

  for (const m of messages) {
    if (m.role === "tool") {
      const block = {
        type: "tool_result",
        tool_use_id: m.tool_call_id ?? "",
        content: m.content ?? "",
      };
      const last = out[out.length - 1];
      if (last && last.role === "user" && Array.isArray(last.content)) {
        last.content.push(block);
      } else {
        out.push({ role: "user", content: [block] });
      }
      continue;
    }

    if (m.role === "assistant") {
      const blocks: Array<AnthropicBlock> = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const tc of m.tool_calls ?? []) {
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(tc.function.arguments || "{}");
        } catch {
          input = {};
        }
        blocks.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
      }
      if (blocks.length) out.push({ role: "assistant", content: blocks as never });
      continue;
    }

    if (m.role === "user") {
      out.push({ role: "user", content: m.content ?? "" });
    }
  }

  // Anthropic requires the conversation to start with a user turn.
  if (!out.length || out[0].role !== "user") {
    out.unshift({ role: "user", content: "Continue." });
  }
  return out;
}

export function fromAnthropicBlocks(blocks: AnthropicBlock[]): Completion {
  const text = blocks
    .filter((b): b is Extract<AnthropicBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
  const tool_calls: ToolCall[] = blocks
    .filter((b): b is Extract<AnthropicBlock, { type: "tool_use" }> => b.type === "tool_use")
    .map((b) => ({
      id: b.id,
      type: "function" as const,
      function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
    }));
  return { content: text || null, tool_calls };
}

class AnthropicProvider implements ChatProvider {
  readonly name = "Anthropic" as const;
  readonly model: string;

  constructor(private readonly apiKey: string) {
    this.model = modelFor("Anthropic");
  }

  async complete(messages: ChatMessage[], tools: ChatTool[]): Promise<Completion> {
    const { system, rest } = splitSystem(messages);
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: anthropicHeaders(this.apiKey),
      body: JSON.stringify({
        model: this.model,
        max_tokens: MAX_TOKENS,
        system: system || undefined,
        messages: toAnthropicMessages(rest),
        tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
      }),
    });
    if (!res.ok) throw new Error(await anthropicError(res));
    const json = await res.json();
    return fromAnthropicBlocks((json.content ?? []) as AnthropicBlock[]);
  }

  async stream(messages: ChatMessage[]): Promise<ReadableStream<Uint8Array>> {
    const { system, rest } = splitSystem(messages);
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: anthropicHeaders(this.apiKey),
      body: JSON.stringify({
        model: this.model,
        max_tokens: MAX_TOKENS,
        system: system || undefined,
        messages: toAnthropicMessages(rest),
        stream: true,
      }),
    });
    if (!res.ok) throw new Error(await anthropicError(res));
    return sseTextStream(res, (data) => {
      if (data.type !== "content_block_delta") return "";
      const delta = data.delta;
      return delta?.type === "text_delta" ? String(delta.text ?? "") : "";
    });
  }
}

async function anthropicError(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as any;
    return json?.error?.message || `Anthropic error ${res.status}`;
  } catch {
    return `Anthropic error ${res.status}`;
  }
}

/* ─────────────────────────── Gemini ─────────────────────────── */

function geminiUrl(model: string, stream: boolean, apiKey: string): string {
  const base = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`;
  const method = stream ? ":streamGenerateContent?alt=sse" : ":generateContent";
  const sep = method.includes("?") ? "&" : "?";
  return `${base}${method}${sep}key=${encodeURIComponent(apiKey)}`;
}

/** OpenAI-style messages → Gemini contents (system goes into systemInstruction). */
export function toGeminiContents(messages: ChatMessage[]): Array<{ role: string; parts: Array<Record<string, unknown>> }> {
  const out: Array<{ role: string; parts: Array<Record<string, unknown>> }> = [];

  for (const m of messages) {
    if (m.role === "tool") {
      out.push({
        role: "user",
        parts: [{ functionResponse: { name: m.tool_call_id || "tool", response: safeParse(m.content) } }],
      });
      continue;
    }
    if (m.role === "assistant") {
      const parts: Array<Record<string, unknown>> = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.tool_calls ?? []) {
        parts.push({ functionCall: { name: tc.function.name, args: safeParse(tc.function.arguments) } });
      }
      if (parts.length) out.push({ role: "model", parts });
      continue;
    }
    if (m.role === "user") {
      out.push({ role: "user", parts: [{ text: m.content ?? "" }] });
    }
  }

  if (!out.length || out[0].role !== "user") {
    out.unshift({ role: "user", parts: [{ text: "Continue." }] });
  }
  return out;
}

function safeParse(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : { value: parsed };
  } catch {
    return { value };
  }
}

class GeminiProvider implements ChatProvider {
  readonly name = "Gemini" as const;
  readonly model: string;

  constructor(private readonly apiKey: string) {
    this.model = modelFor("Gemini");
  }

  async complete(messages: ChatMessage[], tools: ChatTool[]): Promise<Completion> {
    const { system, rest } = splitSystem(messages);
    const res = await fetch(geminiUrl(this.model, false, this.apiKey), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents: toGeminiContents(rest),
        tools: [
          {
            functionDeclarations: tools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            })),
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(await geminiError(res));

    const json = (await res.json()) as any;
    const parts = json?.candidates?.[0]?.content?.parts ?? [];
    const tool_calls: ToolCall[] = [];
    let content = "";
    for (const part of parts) {
      if (part.text) content += part.text;
      if (part.functionCall) {
        tool_calls.push({
          id: `call_${tool_calls.length}_${Date.now()}`,
          type: "function",
          function: { name: part.functionCall.name, arguments: JSON.stringify(part.functionCall.args ?? {}) },
        });
      }
    }
    return { content: content || null, tool_calls };
  }

  async stream(messages: ChatMessage[]): Promise<ReadableStream<Uint8Array>> {
    const { system, rest } = splitSystem(messages);
    const res = await fetch(geminiUrl(this.model, true, this.apiKey), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents: toGeminiContents(rest),
      }),
    });
    if (!res.ok) throw new Error(await geminiError(res));

    return sseTextStream(res, (data) => {
      const parts = data?.candidates?.[0]?.content?.parts ?? [];
      return parts.map((p: { text?: string }) => p.text ?? "").join("");
    });
  }
}

async function geminiError(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as any;
    return json?.error?.message || `Gemini error ${res.status}`;
  } catch {
    return `Gemini error ${res.status}`;
  }
}

/* ─────────────────────── shared streaming ─────────────────────── */

/** Consume an SSE body and turn each event through `extract` into text chunks. */
function sseTextStream(res: Response, extract: (data: any) => string): ReadableStream<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new ReadableStream<Uint8Array>({ start: (c) => c.close() });

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream({
    async start(controller) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newline = buffer.indexOf("\n");
          while (newline !== -1) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf("\n");

            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const text = extract(JSON.parse(payload));
              if (text) controller.enqueue(encoder.encode(text));
            } catch {
              // Ignore malformed SSE lines rather than aborting the response.
            }
          }
        }
      } finally {
        controller.close();
      }
    },
  });
}

/* ─────────────────────────── entry point ─────────────────────────── */

export async function getChatProvider(): Promise<ChatProvider> {
  const { name, apiKey } = await getActiveProvider();
  if (name === "Anthropic") return new AnthropicProvider(apiKey);
  if (name === "Gemini") return new GeminiProvider(apiKey);
  return new OpenAiProvider(apiKey);
}

/** Lightweight key verification used by Settings → API Keys → Test connection. */
export async function testProviderKey(provider: ProviderName, apiKey: string): Promise<{ ok: boolean; error?: string }> {
  const cleanKey = normalizeApiKey(apiKey);
  if (!cleanKey) return { ok: false, error: "Key is empty." };

  if (provider === "OpenAI") {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { authorization: `Bearer ${cleanKey}` },
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: await readError(res, "OpenAI") };
  }

  if (provider === "Anthropic") {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: anthropicHeaders(cleanKey),
      body: JSON.stringify({ model: modelFor("Anthropic"), max_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: await readError(res, "Anthropic") };
  }

  const res = await fetch(geminiUrl(modelFor("Gemini"), false, cleanKey), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "ping" }] }] }),
  });
  if (res.ok) return { ok: true };
  return { ok: false, error: await readError(res, "Gemini") };
}

async function readError(res: Response, label: string): Promise<string> {
  try {
    const json = (await res.json()) as any;
    return json?.error?.message || json?.message || `${label} error ${res.status}`;
  } catch {
    return `${label} error ${res.status}`;
  }
}
