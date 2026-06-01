"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Loader2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/supabase/client";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/store/chat-store";

export function LogoutButton() {
  const router = useRouter();
  const { clearMessages, setCurrentUserId } = useChatStore();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const supabase = createSupabaseBrowserClient();
      clearMessages();
      setCurrentUserId(null);
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error("Logout error:", error);
      setLoggingOut(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleLogout} disabled={loggingOut}>
      {loggingOut ? (
        <Loader2 size={14} className="mr-2 animate-spin" />
      ) : (
        <LogOut size={14} className="mr-2" />
      )}
      {loggingOut ? "Logging out..." : "Logout"}
    </Button>
  );
}
