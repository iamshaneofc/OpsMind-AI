"use client";

import { useEffect, useRef, useState } from "react";
import {
  ShoppingCart,
  Package,
  ListOrdered,
  Boxes,
  Warehouse,
  Users,
  ReceiptText,
  CreditCard,
  Truck,
  LifeBuoy,
  Loader2,
  RotateCcw,
  Play,
} from "lucide-react";

/** Everything below is fetched server-side from real, role-scoped records. */
export type ShowcaseData = {
  customerName: string;
  warehouse: string;
  orders: Array<{ number: string; status: string; amount: string; date: string; customer: string }>;
  items: Array<{ name: string; sku: string; qty: number; price: string }>;
  product: { name: string; sku: string; price: string };
  stock: Array<{ name: string; sku: string; qty: number; warehouse: string; location: string }>;
  customers: Array<{ name: string; phone: string; orders: number }>;
  warehouses: Array<{ name: string; location: string; capacity: string }>;
  invoices: Array<{ number: string; amount: string; status: string; due: string }>;
};

type Msg = { id: string; from: "out" | "in"; text: string; time: string };

type Topic = {
  id: string;
  label: string;
  blurb: string;
  icon: typeof ShoppingCart;
  build: (d: ShowcaseData) => Msg[];
};

let seq = 0;
const uid = () => `m${(seq += 1)}`;

function stamp(offsetMin = 0): string {
  const d = new Date(Date.now() - offsetMin * 60000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Builds a alternating customer/company thread, oldest first. */
function thread(turns: Array<{ from: Msg["from"]; text: string }>): Msg[] {
  return turns.map((t, i) => ({
    id: uid(),
    from: t.from,
    text: t.text,
    time: stamp((turns.length - i) * 3),
  }));
}

const line = (label: string, value: string) => `${label}: *${value}*`;

export const TOPICS: Topic[] = [
  {
    id: "orders",
    label: "Orders",
    blurb: "Customer asks for recent orders",
    icon: ShoppingCart,
    build: (d) =>
      thread([
        { from: "out", text: "Hi, can you show me my recent orders?" },
        {
          from: "in",
          text:
            d.orders.length === 0
              ? "No orders found on your account yet."
              : `Here are your ${Math.min(5, d.orders.length)} most recent orders:\n\n${d.orders
                  .slice(0, 5)
                  .map(
                    (o, i) =>
                      `${i + 1}. *${o.number}*\n   ${o.status} · ${o.amount}\n   ${o.date} · ${o.customer}`,
                  )
                  .join("\n\n")}`,
        },
        { from: "out", text: "Perfect, that's everything I needed." },
        { from: "in", text: "Want me to open any of these for you?" },
      ]),
  },
  {
    id: "items",
    label: "Order items",
    blurb: "Products inside one specific order",
    icon: ListOrdered,
    build: (d) =>
      thread([
        { from: "out", text: `What products are in ${d.orders[0]?.number ?? "my order"}?` },
        {
          from: "in",
          text:
            d.items.length === 0
              ? "This order has no line items recorded."
              : `${d.orders[0]?.number ?? "Your order"} contains ${d.items.length} line item(s):\n\n${d.items
                  .map((i) => `• ${i.qty}× *${i.name}*\n   SKU ${i.sku} · ${i.price}`)
                  .join("\n")}`,
        },
        { from: "out", text: "Can I see the stock for the first one?" },
        { from: "in", text: `Sure — switching to stock for *${d.product.name}*.` },
      ]),
  },
  {
    id: "stock",
    label: "Stock availability",
    blurb: "Live quantity for a product",
    icon: Boxes,
    build: (d) =>
      thread([
        { from: "out", text: `What's the stock availability for ${d.product.name}?` },
        {
          from: "in",
          text:
            d.stock.length === 0
              ? "I couldn't find stock rows for that product."
              : `${d.product.name} (*${d.product.sku}*) across warehouses:\n\n${d.stock
                  .slice(0, 4)
                  .map((s) => `• ${s.qty} units — ${s.warehouse} (${s.location})`)
                  .join("\n")}`,
        },
        {
          from: "in",
          text: `Pack size: 12 units/carton · Unit price ${d.product.price}.\nSay "package" for dispatch packaging.`,
        },
        { from: "out", text: "Great, please reserve 24 units." },
        { from: "in", text: "Reserved. I'll confirm once it's picked." },
      ]),
  },
  {
    id: "warehouse",
    label: "Warehouses",
    blurb: "Locations, capacity and where stock sits",
    icon: Warehouse,
    build: (d) =>
      thread([
        { from: "out", text: "Where are your warehouses located?" },
        {
          from: "in",
          text:
            d.warehouses.length === 0
              ? "No warehouses registered."
              : `We currently operate ${d.warehouses.length} facility(ies):\n\n${d.warehouses
                  .slice(0, 5)
                  .map((w) => `• *${w.name}*\n   ${w.location} · capacity ${w.capacity}`)
                  .join("\n")}`,
        },
        { from: "out", text: "Which one is holding my order?" },
        {
          from: "in",
          text: `${d.orders[0]?.number ?? "Your order"} is stored at *${d.warehouse}*.`,
        },
      ]),
  },
  {
    id: "products",
    label: "Products",
    blurb: "Catalogue with pricing",
    icon: Package,
    build: (d) =>
      thread([
        { from: "out", text: "What products do you stock right now?" },
        {
          from: "in",
          text:
            d.stock.length === 0
              ? "The catalogue is empty for your scope."
              : `Top lines by availability:\n\n${d.stock
                  .slice(0, 5)
                  .map((s, i) => `${i + 1}. *${s.name}*\n   ${s.sku} · ${s.qty} in stock`)
                  .join("\n")}`,
        },
        { from: "out", text: "Send me the price list for these." },
        {
          from: "in",
          text: `${d.product.name} is listed at *${d.product.price}* per unit. Reply "quote" for a bulk quote.`,
        },
      ]),
  },
  {
    id: "customers",
    label: "Customers",
    blurb: "Who you serve, with contact numbers",
    icon: Users,
    build: (d) =>
      thread([
        { from: "out", text: "Who are my top customers this period?" },
        {
          from: "in",
          text:
            d.customers.length === 0
              ? "No customers found in your scope."
              : `Ranked by order volume:\n\n${d.customers
                  .slice(0, 5)
                  .map((c, i) => `${i + 1}. *${c.name}*\n   ${c.orders} order(s) · ${c.phone}`)
                  .join("\n")}`,
        },
        { from: "out", text: "Add a note to the top account." },
        { from: "in", text: "Note added to the account timeline." },
      ]),
  },
  {
    id: "invoices",
    label: "Invoices",
    blurb: "Amounts, status and due dates",
    icon: ReceiptText,
    build: (d) =>
      thread([
        { from: "out", text: "Show me my invoices." },
        {
          from: "in",
          text:
            d.invoices.length === 0
              ? "No invoices are open on your account."
              : `${d.invoices.length} invoice(s) on file:\n\n${d.invoices
                  .slice(0, 5)
                  .map((v) => `• *${v.number}*\n   ${v.amount} · ${v.status} · due ${v.due}`)
                  .join("\n")}`,
        },
        { from: "out", text: "Any of them overdue?" },
        {
          from: "in",
          text: d.invoices.some((v) => v.status === "OVERDUE")
            ? "Yes — see the OVERDUE rows above. I can send a payment link."
            : "Nothing overdue right now. All good.",
        },
      ]),
  },
  {
    id: "payments",
    label: "Payments",
    blurb: "Settle an open balance in chat",
    icon: CreditCard,
    build: (d) => {
      const due = d.invoices.filter((v) => v.status !== "PAID");
      return thread([
        { from: "out", text: "How much do I owe right now?" },
        {
          from: "in",
          text:
            due.length === 0
              ? "Nothing outstanding — your account is fully settled."
              : `You have ${due.length} open item(s):\n\n${due
                  .slice(0, 4)
                  .map((v) => `• ${v.number} — *${v.amount}* (${v.status}, due ${v.due})`)
                  .join("\n")}`,
        },
        { from: "out", text: "Pay the first one now." },
        { from: "in", text: "Payment link sent. I'll mark it PAID the moment it clears." },
      ]);
    },
  },
  {
    id: "delivery",
    label: "Delivery tracking",
    blurb: "Live status and ETA for an order",
    icon: Truck,
    build: (d) => {
      const o = d.orders[0];
      return thread([
        { from: "out", text: "Where is my order?" },
        o
          ? {
              from: "in",
              text: `*${o.number}* — ${o.status}\n\n• Ordered ${o.date}\n• Value ${o.amount}\n• ETA ${o.date}\n• Warehouse ${d.warehouse}`,
            }
          : { from: "in", text: "I couldn't find an order to track on your account." },
        { from: "out", text: "Can you notify me on WhatsApp when it ships?" },
        { from: "in", text: "Done — you'll get a message the moment it's marked SHIPPED." },
        { from: "in", text: "I'll also ping you 30 minutes before the driver arrives." },
      ]);
    },
  },
  {
    id: "support",
    label: "Support",
    blurb: "Returns, warranty and a human handoff",
    icon: LifeBuoy,
    build: (d) =>
      thread([
        { from: "out", text: "I received a damaged item, can you help?" },
        { from: "in", text: "Sorry about that. Which order was it?" },
        { from: "out", text: d.orders[0]?.number ?? "My last order" },
        {
          from: "in",
          text: `Found it — ${d.orders[0]?.customer ?? d.customerName}, ${d.orders[0]?.amount ?? "n/a"}.\n\nI've raised a return for *${d.product.name}* and emailed you a prepaid label.`,
        },
        { from: "out", text: "How long will the refund take?" },
        { from: "in", text: "3–5 working days after the pickup. Want me to loop in a human agent?" },
      ]),
  },
];

function Ticks() {
  return (
    <span className="ml-1 inline-flex translate-y-[1px]">
      <svg width="15" height="11" viewBox="0 0 16 11" fill="none" aria-hidden>
        <path d="M1 5.5 4.2 9 10.5 1.5" stroke="#53BDEB" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5.5 5.5 8.7 9 15 1.5" stroke="#53BDEB" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function WhatsAppShowcase({ data }: { data: ShowcaseData }) {
  const [active, setActive] = useState<string>(TOPICS[0].id);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const play = (topic: Topic) => {
    clearTimers();
    setActive(topic.id);
    setMessages([]);
    setTyping(false);

    const script = topic.build(data);
    let at = 250;

    for (const m of script) {
      if (m.from === "in") {
        const msg = m;
        timers.current.push(setTimeout(() => setTyping(true), at));
        at += 850;
        timers.current.push(
          setTimeout(() => {
            setTyping(false);
            setMessages((prev) => [...prev, msg]);
          }, at),
        );
      } else {
        const msg = m;
        timers.current.push(setTimeout(() => setMessages((prev) => [...prev, msg]), at));
      }
      at += 650;
    }
  };

  useEffect(() => {
    play(TOPICS[0]);
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  const current = TOPICS.find((t) => t.id === active) ?? TOPICS[0];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      {/* Phone */}
      <div className="mx-auto w-full max-w-[320px]">
        <div className="rounded-[2.25rem] border border-white/10 bg-[#0B141A] p-2 shadow-[0_30px_60px_-25px_rgba(0,0,0,0.9)]">
          <div className="relative overflow-hidden rounded-[1.75rem] border border-white/5 bg-[#0B141A]">
            <div className="flex items-center justify-center py-1.5">
              <span className="h-1.5 w-16 rounded-full bg-white/15" />
            </div>

            <div className="flex items-center gap-3 bg-[#202C33] px-3 py-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#25D366]/20 text-[13px] font-bold text-[#25D366]">
                O
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-white">OpsMind Orders</p>
                <p className="truncate text-[11px] text-[#8696A0]">{data.customerName} · demo</p>
              </div>
              <span className="rounded-full bg-[#25D366]/15 px-2 py-0.5 text-[10px] font-semibold text-[#25D366]">
                DEMO
              </span>
            </div>

            <div
              ref={scrollRef}
              className="h-[380px] space-y-2 overflow-y-auto px-3 py-3"
              style={{
                backgroundColor: "#0B141A",
                backgroundImage:
                  "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.035) 0 1px, transparent 1px), radial-gradient(circle at 70% 65%, rgba(255,255,255,0.03) 0 1px, transparent 1px)",
                backgroundSize: "26px 26px",
              }}
            >
              {messages.length === 0 && !typing ? (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <Loader2 size={16} className="mb-2 animate-spin text-[#8696A0]" />
                  <p className="text-[12px] text-[#667781]">Loading conversation…</p>
                </div>
              ) : null}

              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.from === "out" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-[12px] leading-[1.5] shadow ${
                      m.from === "out" ? "bg-[#005C4B] text-white" : "bg-[#202C33] text-[#E9EDEF]"
                    }`}
                    style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                  >
                    <span className="whitespace-pre-wrap">{m.text}</span>
                    <span className="ml-2 inline-flex translate-y-[2px] items-center gap-1 text-[10px] text-[#8696A0]">
                      {m.time}
                      {m.from === "out" ? <Ticks /> : null}
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
                <Play size={12} />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Topic headers */}
      <div className="space-y-5">
        <div className="space-y-1.5">
          <h4 className="text-base font-semibold text-white">Conversation topics</h4>
          <p className="text-sm text-muted-foreground">
            Pick a topic to replay a full two-way thread. Every number, SKU, warehouse and invoice
            below is read live from your scoped workspace — nothing is hard-coded.
          </p>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {TOPICS.map((t) => {
            const Icon = t.icon;
            const isActive = t.id === active;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => play(t)}
                className={`group flex items-start gap-2.5 rounded-lg border p-3 text-left transition-all ${
                  isActive
                    ? "border-[#25D366]/50 bg-[#25D366]/10"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                    isActive ? "bg-[#25D366]/20 text-[#25D366]" : "bg-white/5 text-muted-foreground group-hover:text-white/80"
                  }`}
                >
                  <Icon size={14} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold leading-tight text-white">
                    {t.label}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{t.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => play(current)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-semibold text-[#063B24] transition-colors hover:bg-[#2AE171]"
          >
            <RotateCcw size={14} /> Replay {current.label}
          </button>
          <span className="text-xs text-muted-foreground">
            {current.build(data).length} messages · nothing is sent to a real phone.
          </span>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Thread preview · {current.label}
          </p>
          <div className="mt-2 space-y-1.5">
            {current.build(data).map((m) => (
              <p key={m.id} className="flex gap-2 text-[11px] leading-[1.55]">
                <span className={m.from === "out" ? "text-[#25D366]" : "text-primary"}>
                  {m.from === "out" ? "You" : "OpsMind"}
                </span>
                <span className="line-clamp-2 whitespace-pre-wrap text-white/60">{m.text}</span>
              </p>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-semibold text-white">How it works in production:</span> OpsMind maps
            order, inventory and invoice events to approved WhatsApp templates, sends them through
            the WhatsApp Business Cloud API, and writes delivery receipts back onto the order
            timeline. The account connection lives in the section below.
          </p>
        </div>
      </div>
    </div>
  );
}
