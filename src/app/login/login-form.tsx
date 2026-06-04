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
            placeholder="name@opsmind.ai"
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
          <Button 
            variant="outline" 
            size="sm"
            className="border-white/10 bg-white/5 hover:bg-white/10 text-xs py-1"
            onClick={() => { setEmail("admin@opsmind.ai"); setPassword("password123"); }}
          >
            Admin
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            className="border-white/10 bg-white/5 hover:bg-white/10 text-xs py-1"
            onClick={() => { setEmail("manager@opsmind.ai"); setPassword("password123"); }}
          >
            Manager
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            className="border-white/10 bg-white/5 hover:bg-white/10 text-xs py-1"
            onClick={() => { setEmail("analyst@opsmind.ai"); setPassword("password123"); }}
          >
            Analyst
          </Button>
        </div>
      </div>
    </div>
  );
}
