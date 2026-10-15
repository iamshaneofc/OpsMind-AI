"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare } from "lucide-react";

/** Persistent demo CTA — hidden on the assistant page itself. */
export function AskAssistantFab() {
  const pathname = usePathname();
  if (pathname?.startsWith("/dashboard/chatbot")) return null;

  return (
    <Link
      href="/dashboard/chatbot"
      className="fixed bottom-6 right-6 z-30 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-[0_16px_40px_-12px_rgba(59,130,246,0.85)] transition hover:scale-[1.03] hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      aria-label="Ask OpsMind Assistant"
    >
      <MessageSquare size={16} />
      Ask Assistant
    </Link>
  );
}
