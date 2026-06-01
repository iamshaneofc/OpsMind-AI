"use client";

import { useState } from "react";
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    clearMessages();
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md p-6">
      <CardTitle className="mb-1 text-2xl tracking-tight">SRL AI</CardTitle>
      <CardDescription className="mb-6">Enterprise operations intelligence for SRL Chemicals</CardDescription>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Email</label>
          <Input
            type="email"
            placeholder="name@srlchemicals.com"
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
        <Button className="w-full" type="submit" disabled={loading}>
          {loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <LogIn size={16} className="mr-2" />}
          Login
        </Button>
      </form>
    </Card>
  );
}
