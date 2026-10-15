"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronDown, Loader2 } from "lucide-react";
import {
  DEFAULT_INDUSTRY,
  INDUSTRIES,
  INDUSTRY_COOKIE,
  INDUSTRY_IDS,
  parseIndustry,
  type IndustryId,
} from "@/lib/industry";
import { useChatStore } from "@/store/chat-store";
import { cn } from "@/utils/cn";

function readCookieIndustry(): IndustryId {
  if (typeof document === "undefined") return DEFAULT_INDUSTRY;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${INDUSTRY_COOKIE}=`));
  if (!match) return DEFAULT_INDUSTRY;
  return parseIndustry(decodeURIComponent(match.split("=").slice(1).join("=")));
}

export function IndustrySwitcher({ initialIndustry }: { initialIndustry?: IndustryId }) {
  const router = useRouter();
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const addMessage = useChatStore((s) => s.addMessage);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const [industry, setIndustry] = useState<IndustryId>(initialIndustry ?? DEFAULT_INDUSTRY);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setIndustry(initialIndustry ?? readCookieIndustry());
  }, [initialIndustry]);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 8,
      right: Math.max(12, window.innerWidth - rect.right),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onResize = () => updatePosition();
    const onScroll = () => updatePosition();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, updatePosition]);

  const select = useCallback(
    async (next: IndustryId) => {
      if (next === industry) {
        setOpen(false);
        return;
      }
      setOpen(false);
      try {
        const res = await fetch("/api/industry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ industry: next }),
        });
        if (!res.ok) throw new Error("Failed to switch industry");
        setIndustry(next);
        clearMessages();
        const nextMeta = INDUSTRIES[next];
        addMessage({
          role: "assistant",
          content: `**Switched to ${nextMeta.label}.** Now querying **${nextMeta.companyName}** operations data (${nextMeta.unit}). Ask about orders, stock, invoices, or distributors.`,
        });
        window.dispatchEvent(
          new CustomEvent("opsmind:industry-changed", { detail: { industry: next } }),
        );
        startTransition(() => {
          router.refresh();
        });
      } catch (err) {
        console.error(err);
      }
    },
    [industry, clearMessages, addMessage, router],
  );

  const meta = INDUSTRIES[industry];

  const menu =
    mounted &&
    open &&
    createPortal(
      <>
        <div
          className="fixed inset-0 z-[200] bg-black/40"
          aria-hidden
          onClick={() => setOpen(false)}
        />
        <div
          ref={menuRef}
          id={listId}
          role="listbox"
          aria-label="Industry dataset"
          style={{ top: menuPos.top, right: menuPos.right }}
          className="fixed z-[210] w-[300px] overflow-hidden rounded-xl border border-white/12 bg-[#0b0d12] shadow-[0_28px_80px_-24px_rgba(0,0,0,0.95)]"
        >
          <div className="border-b border-white/8 px-3.5 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Switch dataset
            </p>
          </div>
          <ul className="max-h-[min(360px,70vh)] overflow-y-auto py-1.5 scrollbar-none">
            {INDUSTRY_IDS.map((id) => {
              const item = INDUSTRIES[id];
              const active = id === industry;
              return (
                <li key={id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    disabled={pending}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void select(id);
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition",
                      active ? "bg-primary/15" : "hover:bg-white/[0.06]",
                      pending && "pointer-events-none opacity-60",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                        active
                          ? "border-primary/40 bg-primary/20 text-primary"
                          : "border-white/10 bg-white/[0.04] text-muted-foreground",
                      )}
                    >
                      <Building2 className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white">
                        {item.companyName}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {item.label} · {item.unit}
                      </span>
                    </span>
                    {active ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </>,
      document.body,
    );

  return (
    <div className="relative z-[60]">
      <button
        ref={triggerRef}
        type="button"
        disabled={pending}
        onClick={() => {
          if (!open) updatePosition();
          setOpen((v) => !v);
        }}
        className={cn(
          "flex max-w-[260px] items-center gap-2.5 rounded-xl border border-white/10 bg-[#0b0d12] px-2.5 py-1.5 text-left shadow-sm transition hover:border-primary/45 hover:bg-[#10131a]",
          open && "border-primary/40 ring-1 ring-primary/25",
          pending && "opacity-70",
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Building2 className="h-4 w-4" />
          )}
        </span>
        <span className="hidden min-w-0 sm:flex sm:flex-col">
          <span className="truncate text-[13px] font-semibold leading-tight text-white">
            {meta.companyName}
          </span>
          <span className="truncate text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {meta.label} dataset
          </span>
        </span>
        <span className="text-sm font-semibold text-white sm:hidden">{meta.shortLabel}</span>
        <ChevronDown
          className={cn(
            "ml-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {menu}
    </div>
  );
}
