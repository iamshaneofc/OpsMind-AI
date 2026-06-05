"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Search, LayoutDashboard, MessageSquare, Package, ShoppingCart, Users, LineChart, FileText, Settings } from "lucide-react";
import type { AppRole } from "@/types/auth";

interface CommandPaletteProps {
  role: AppRole;
}

export function CommandPalette({ role }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setOpen(false)}>
      <div 
        className="w-full max-w-lg bg-card rounded-2xl border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden" 
        onClick={(e) => e.stopPropagation()}
      >
        <Command
          className="flex flex-col h-full w-full bg-transparent text-foreground"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <div className="flex items-center border-b border-white/5 px-3">
            <Search className="mr-2 h-5 w-5 shrink-0 text-muted-foreground" />
            <Command.Input
              autoFocus
              placeholder="Type a command or search..."
              className="flex h-14 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          
          <Command.List className="max-h-[300px] overflow-y-auto overflow-x-hidden p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>
            
            <Command.Group heading="Navigation" className="text-xs font-medium text-muted-foreground px-2 py-1.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-muted-foreground">
              <Command.Item
                onSelect={() => runCommand(() => router.push("/dashboard"))}
                className="relative flex cursor-pointer select-none items-center rounded-lg px-2 py-3 text-sm outline-none aria-selected:bg-primary/20 aria-selected:text-primary data-[disabled]:pointer-events-none data-[disabled]:opacity-50 text-foreground transition-colors"
              >
                <LayoutDashboard className="mr-3 h-4 w-4" />
                Dashboard
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => router.push("/dashboard/chatbot"))}
                className="relative flex cursor-pointer select-none items-center rounded-lg px-2 py-3 text-sm outline-none aria-selected:bg-primary/20 aria-selected:text-primary data-[disabled]:pointer-events-none data-[disabled]:opacity-50 text-foreground transition-colors"
              >
                <MessageSquare className="mr-3 h-4 w-4" />
                AI Copilot
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => router.push("/dashboard/orders"))}
                className="relative flex cursor-pointer select-none items-center rounded-lg px-2 py-3 text-sm outline-none aria-selected:bg-primary/20 aria-selected:text-primary data-[disabled]:pointer-events-none data-[disabled]:opacity-50 text-foreground transition-colors"
              >
                <ShoppingCart className="mr-3 h-4 w-4" />
                Orders
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => router.push("/dashboard/inventory"))}
                className="relative flex cursor-pointer select-none items-center rounded-lg px-2 py-3 text-sm outline-none aria-selected:bg-primary/20 aria-selected:text-primary data-[disabled]:pointer-events-none data-[disabled]:opacity-50 text-foreground transition-colors"
              >
                <Package className="mr-3 h-4 w-4" />
                Inventory
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => router.push("/dashboard/customers"))}
                className="relative flex cursor-pointer select-none items-center rounded-lg px-2 py-3 text-sm outline-none aria-selected:bg-primary/20 aria-selected:text-primary data-[disabled]:pointer-events-none data-[disabled]:opacity-50 text-foreground transition-colors"
              >
                <Users className="mr-3 h-4 w-4" />
                Customers
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Intelligence" className="text-xs font-medium text-muted-foreground px-2 py-1.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-muted-foreground mt-2">
              <Command.Item
                onSelect={() => runCommand(() => router.push("/dashboard/insights"))}
                className="relative flex cursor-pointer select-none items-center rounded-lg px-2 py-3 text-sm outline-none aria-selected:bg-primary/20 aria-selected:text-primary data-[disabled]:pointer-events-none data-[disabled]:opacity-50 text-foreground transition-colors"
              >
                <LineChart className="mr-3 h-4 w-4" />
                Insights Hub
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => router.push("/dashboard/reports"))}
                className="relative flex cursor-pointer select-none items-center rounded-lg px-2 py-3 text-sm outline-none aria-selected:bg-primary/20 aria-selected:text-primary data-[disabled]:pointer-events-none data-[disabled]:opacity-50 text-foreground transition-colors"
              >
                <FileText className="mr-3 h-4 w-4" />
                Reports
              </Command.Item>
            </Command.Group>
            
            <Command.Group heading="Settings" className="text-xs font-medium text-muted-foreground px-2 py-1.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-muted-foreground mt-2">
              <Command.Item
                onSelect={() => runCommand(() => router.push("/dashboard/account"))}
                className="relative flex cursor-pointer select-none items-center rounded-lg px-2 py-3 text-sm outline-none aria-selected:bg-primary/20 aria-selected:text-primary data-[disabled]:pointer-events-none data-[disabled]:opacity-50 text-foreground transition-colors"
              >
                <Settings className="mr-3 h-4 w-4" />
                Account Settings
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
