import { redirect } from "next/navigation";
import { BotAvatar } from "@/components/bot-avatar";
import { LoginForm } from "@/app/login/login-form";
import { getCurrentUserProfile } from "@/services/auth";

export default async function LoginPage() {
  const session = await getCurrentUserProfile();
  if (session) redirect("/dashboard");

  return (
    <main className="flex min-h-screen w-full bg-[#050505]">
      {/* Left Side - Brand & Hero */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden border-r border-white/10 bg-black/40 p-12 lg:flex">
        {/* Subtle animated background gradients */}
        <div className="absolute -left-[20%] top-0 h-[500px] w-[500px] rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute -bottom-[20%] right-0 h-[600px] w-[600px] rounded-full bg-secondary/10 blur-[150px]" />
        
        <div className="relative z-10 flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 text-primary ring-1 ring-primary/30 shadow-[0_0_20px_rgba(79,70,229,0.3)]">
            <BotAvatar />
          </div>
          <span className="text-xl font-medium text-white tracking-wide">OpsMind AI</span>
        </div>

        <div className="relative z-10 mb-20 max-w-lg">
          <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-white md:text-5xl lg:text-[56px]">
            AI-Powered <br />
            <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">Operations Copilot</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground font-light leading-relaxed">
            Monitor the entire order lifecycle, track warehouse inventory, and detect supply chain anomalies in one autonomous workspace.
          </p>

          <div className="mt-12 space-y-4 text-sm text-white/70">
            <div className="flex items-center space-x-3">
              <div className="h-[1px] w-8 bg-primary/50" />
              <p>Predictive inventory analysis</p>
            </div>
            <div className="flex items-center space-x-3">
              <div className="h-[1px] w-8 bg-primary/50" />
              <p>Automated anomaly detection</p>
            </div>
            <div className="flex items-center space-x-3">
              <div className="h-[1px] w-8 bg-primary/50" />
              <p>Natural language data querying</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 text-xs text-muted-foreground/50">
          © {new Date().getFullYear()} OpsMind Intelligence. All rights reserved.
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="flex w-full flex-col items-center justify-center p-8 lg:w-1/2 relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/10 via-background to-background" />
        
        <div className="relative z-10 w-full max-w-[400px]">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
