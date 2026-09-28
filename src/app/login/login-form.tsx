"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn } from "lucide-react";
import { createSupabaseBrowserClient } from "@/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useChatStore } from "@/store/chat-store";

export function LoginForm() {
  const router = useRouter();
  const { clearMessages } = useChatStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailPlaceholder, setEmailPlaceholder] = useState("name@opsmind.ai");
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoAvailable, setDemoAvailable] = useState(false);
  const [stage, setStage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/demo-login", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(() => {
        if (active) setDemoAvailable(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function fillDemoAdmin() {
    setDemoLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/demo-login", { cache: "no-store" });
      if (!res.ok) {
        setError("Demo login is not enabled on this deployment.");
        return;
      }
      const data = await res.json();
      setEmail(data.email);
      setPassword(data.password);
    } catch {
      setError("Could not load demo credentials.");
    } finally {
      setDemoLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setStage("Signing in with Supabase…");

    // signInWithPassword talks to Supabase directly (cross-region) and can take
    // seconds on a slow link. Abort rather than spin silently forever.
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error("Sign-in timed out after 30s. Please try again.")),
        30_000,
      );
    });

    try {
      // Created inside try: getSupabaseEnv() throws when NEXT_PUBLIC_* was not
      // inlined at build time. An uncaught throw here left the button spinning
      // forever with no error.
      const supabase = createSupabaseBrowserClient();

      const { error: authError } = await Promise.race([
        supabase.auth.signInWithPassword({ email, password }),
        timeout,
      ]);

      if (authError) {
        setError(authError.message);
        setLoading(false);
        setStage(null);
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed. Please try again.");
      setLoading(false);
      setStage(null);
      return;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    clearMessages();
    setStage("Loading dashboard…");
    window.location.assign("/dashboard");
  }

  return (
    <div className="glass-card w-full p-8 shadow-2xl relative z-10">
      <div className="mb-8 text-center lg:text-left">
        <h2 className="text-2xl font-semibold tracking-tight text-white mb-2">Welcome Back</h2>
        <p className="text-sm text-muted-foreground">Sign in to your enterprise workspace.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1">
          <label className="mb-1 block text-xs text-muted-foreground">Email</label>
          <Input
            id="email"
            type="email"
            placeholder={emailPlaceholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Password</label>
          <Input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90 py-5 font-medium transition-all" type="submit" disabled={loading}>
          {loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <LogIn size={16} className="mr-2" />}
          Continue to Dashboard
        </Button>
        {stage ? (
          <p className="text-xs text-muted-foreground text-center mt-2" role="status" aria-live="polite">
            {stage}
          </p>
        ) : null}
      </form>

      <div className="mt-8">
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground bg-[#0A0A0A]/80 backdrop-blur-sm rounded">One-Click Demo Login</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {demoAvailable && (
            <Button
              variant="outline"
              size="sm"
              className="border-white/10 bg-white/5 hover:bg-white/10 text-xs py-1"
              onClick={fillDemoAdmin}
              disabled={demoLoading}
            >
              {demoLoading ? <Loader2 size={12} className="mr-1 animate-spin" /> : null}
              Admin
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
