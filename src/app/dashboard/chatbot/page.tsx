import { ChatbotPanel } from "@/components/chatbot/chatbot-panel";
import { requireAuthenticatedUser } from "@/services/auth";

export default async function ChatbotPage() {
  const { profile } = await requireAuthenticatedUser();

  // Start with empty messages - chat will be cleared on mount
  // This ensures fresh start every time user navigates to chatbot
  return <ChatbotPanel initialMessages={[]} userRole={profile.role} />;
}
