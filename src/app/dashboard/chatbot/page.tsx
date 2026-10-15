import { Suspense } from "react";
import { ChatbotPanel } from "@/components/chatbot/chatbot-panel";
import { requireAuthenticatedUser } from "@/services/auth";

export default async function ChatbotPage() {
  const { profile } = await requireAuthenticatedUser();

  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading assistant…</div>}>
      <ChatbotPanel initialMessages={[]} userRole={profile.role} />
    </Suspense>
  );
}
