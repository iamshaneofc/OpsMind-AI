"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCheck, Loader2, Send, RotateCcw } from "lucide-react";

export type DemoContext = {
  orderNumber: string;
  customerName: string;
  amount: string;
  deliveryDate: string;
};

type Tick = "sent" | "delivered" | "read";

type Msg = {
  id: string;
  from: "out" | "in";
  text: string;
  time: string;
  ticks?: Tick;
  pending?: boolean;
};

type Template = {
  id: string;
  label: string;
  hint: string;
  build: (c: DemoContext) => string;
  reply: string;
};

const TEMPLATES: Template[] = [
  {
    id: "confirmed",
    label: "Order confirmed",
    hint: "Sent right after checkout",
    build: (c) =>
      `Hi ${c.customerName.split(" ")[0]}, your order *${c.orderNumber}* is confirmed — total ${c.amount}. We'll share the dispatch update shortly.`,
    reply: "Great, thanks! When will it ship?",
  },
  {
    id: "dispatch",
    label: "Out for delivery",
    hint: "Triggered on SHIPPED status",
    build: (c) =>
      `Update on *${c.orderNumber}*: your shipment is out for delivery and is expected on ${c.deliveryDate}. Track it in the OpsMind app.`,
    reply: "Perfect, I'll keep someone at the gate.",
  },
  {
    id: "delay",
    label: "Delay alert",
    hint: "Triggered on DELAYED status",
    build: (c) =>
      `Heads-up ${c.customerName.split(" ")[0]} — *${c.orderNumber}* is running behind schedule. New ETA ${c.deliveryDate}. Apologies for the wait.`,
    reply: "Understood. Please keep me posted.",
  },
  {
    id: "payment",
    label: "Payment reminder",
    hint: "Triggered on UNPAID invoice",
    build: (c) => `Reminder: invoice for *${c.orderNumber}* (${c.amount}) is still open. You can settle it directly from this chat.`,
    reply: "I'll take care of it today.",
  },
];

function now(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const nextId = () => `m${Date.now()}${Math.random().toString(16).slice(2, 7)}`;

function Ticks({ state }: { state?: Tick }) {
  if (!state) return null;
  const color = state === "read" ? "#53BDEB" : "#8696A0";
  return (
    <span className="ml-1 inline-flex translate-y-[1px]">
      <svg width="15" height="11" viewBox="0 0 16 11" fill="none" aria-hidden>
        <path
          d="M1 5.5 4.2 9 10.5 1.5"
          stroke={color}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {state !== "sent" ? (
          <path
            d="M5.5 5.5 8.7 9 15 1.5"
            stroke={color}
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </svg>
    </span>
  );
}

export function WhatsAppDemo({ context }: { context: DemoContext }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [active, setActive] = useState<string>(TEMPLATES[0].id);
  const [typing, setTyping] = useState(false);
  const [sending, setSending] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  const reset = () => {
    clearTimers();
    setTyping(false);
    setSending(false);
    setMessages([]);
  };

  const send = (template: Template) => {
    clearTimers();
    setActive(template.id);
    setSending(true);
    setTyping(false);

    const out: Msg = { id: nextId(), from: "out", text: template.build(context), time: now(), pending: true };
    setMessages((prev) => [...prev, out]);

    const patch = (ticks: Tick) =>
      setMessages((prev) => prev.map((m) => (m.id === out.id ? { ...m, pending: false, ticks } : m)));

    timers.current.push(setTimeout(() => patch("sent"), 550));
    timers.current.push(setTimeout(() => patch("delivered"), 1200));
    timers.current.push(
      setTimeout(() => {
        patch("read");
        setSending(false);
        setTyping(true);
      }, 2000),
    );
    timers.current.push(
      setTimeout(() => {
        setTyping(false);
        setMessages((prev) => [...prev, { id: nextId(), from: "in", text: template.reply, time: now() }]);
      }, 3400),
    );
  };

  const template = TEMPLATES.find((t) => t.id === active) ?? TEMPLATES[0];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      {/* Phone mock-up */}
      <div className="mx-auto w-full max-w-[320px]">
        <div className="rounded-[2.25rem] border border-white/10 bg-[#0B141A] p-2 shadow-[0_30px_60px_-25px_rgba(0,0,0,0.9)]">
          <div className="relative overflow-hidden rounded-[1.75rem] border border-white/5 bg-[#0B141A]">
            <div className="flex items-center justify-center py-1.5">
              <span className="h-1.5 w-16 rounded-full bg-white/15" />
            </div>

            <div className="flex items-center gap-3 bg-[#202C33] px-3 py-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#25D366]/20 text-[#25D366] text-xs font-bold">
                {context.customerName.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-white">{context.customerName}</p>
                <p className="truncate text-[11px] text-[#8696A0]">online</p>
              </div>
              <span className="rounded-full bg-[#25D366]/15 px-2 py-0.5 text-[10px] font-semibold text-[#25D366]">
                DEMO
              </span>
            </div>

            <div
              ref={scrollRef}
              className="h-[360px] space-y-2 overflow-y-auto px-3 py-3"
              style={{
                backgroundColor: "#0B141A",
                backgroundImage:
                  "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.035) 0 1px, transparent 1px), radial-gradient(circle at 70% 65%, rgba(255,255,255,0.03) 0 1px, transparent 1px)",
                backgroundSize: "26px 26px",
              }}
            >
              {messages.length === 0 && !typing ? (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <p className="text-[13px] font-medium text-[#8696A0]">No messages yet</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-[#667781]">
                    Pick a template on the right to preview how OpsMind would message this customer.
                  </p>
                </div>
              ) : null}

              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.from === "out" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[82%] rounded-lg px-2.5 py-1.5 text-[12.5px] leading-snug shadow ${
                      m.from === "out" ? "bg-[#005C4B] text-white" : "bg-[#202C33] text-[#E9EDEF]"
                    }`}
                    style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                  >
                    <span className="whitespace-pre-wrap">{m.text}</span>
                    <span className="ml-2 inline-flex translate-y-[2px] items-center gap-1 text-[10px] text-[#8696A0]">
                      {m.time}
                      {m.pending ? (
                        <Loader2 size={11} className="animate-spin text-[#8696A0]" />
                      ) : (
                        <Ticks state={m.ticks} />
                      )}
                    </span>
                  </div>
                </div>
              ))}

              {typing ? (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1 rounded-lg bg-[#202C33] px-3 py-2.5">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#8696A0]"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2 bg-[#202C33] px-3 py-2.5">
              <div className="flex-1 rounded-full bg-[#2A3942] px-3 py-1.5 text-[12px] text-[#667781]">
                Message
              </div>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#25D366] text-[#0B141A]">
                <Send size={13} />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Template picker */}
      <div className="space-y-5">
        <div className="space-y-1.5">
          <h4 className="text-base font-semibold text-white">Message templates</h4>
          <p className="text-sm text-muted-foreground">
            Every template below is populated with a real order from your workspace
            (<span className="font-mono text-white/80">{context.orderNumber}</span>). Select one to
            run the conversation.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {TEMPLATES.map((t) => {
            const isActive = t.id === active;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => send(t)}
                disabled={sending}
                className={`group rounded-xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-70 ${
                  isActive
                    ? "border-[#25D366]/50 bg-[#25D366]/10"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-white">{t.label}</span>
                  {sending && isActive ? (
                    <Loader2 size={14} className="animate-spin text-[#25D366]" />
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t.hint}</p>
                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-white/60">
                  {t.build(context)}
                </p>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => send(template)}
            disabled={sending}
            className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-semibold text-[#063B24] transition-colors hover:bg-[#2AE171] disabled:opacity-60"
          >
            <Send size={15} /> Send template
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
          >
            <RotateCcw size={14} /> Reset
          </button>
          <span className="text-xs text-muted-foreground">
            Nothing is sent to a real phone number.
          </span>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-semibold text-white">How it works in production:</span> OpsMind maps
            order status transitions to approved WhatsApp template messages, sends them through the
            WhatsApp Business Cloud API, then writes delivery and read receipts back onto the order
            timeline. The account connection for that lives in the section below.
          </p>
        </div>
      </div>
    </div>
  );
}
