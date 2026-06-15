import { ChatbotPanel } from "@/components/chatbot/chatbot-panel";
import { requireAuthenticatedUser } from "@/services/auth";

export default async function ChatbotPage() {
  const { profile } = await requireAuthenticatedUser();


  return <ChatbotPanel initialMessages={[]} userRole={profile.role} />;
}
