import { redirect } from "next/navigation";
import { BotAvatar } from "@/components/bot-avatar";
import { LoginForm } from "@/app/login/login-form";
import { getCurrentUserProfile } from "@/services/auth";

export default async function LoginPage() {
  const session = await getCurrentUserProfile();
  if (session) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-2">
        <div className="glass-panel hidden rounded-3xl p-8 lg:block">
          <BotAvatar />
          <h1 className="mt-4 text-3xl font-semibold leading-tight">
            OpsMind Operations Intelligence
            <br />
            Enterprise AI Command Center
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Monitor order lifecycle, warehouse movement, and distributor signals in one operational
            workspace.
          </p>
        </div>
        <div className="flex items-center justify-center">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
