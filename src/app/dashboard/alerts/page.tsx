import { redirect } from "next/navigation";
import { AlertsPanel } from "@/components/alerts/alerts-panel";
import { requireAuthenticatedUser } from "@/services/auth";
import { getAlerts } from "@/services/operations";

export default async function AlertsPage() {
  const { profile } = await requireAuthenticatedUser();
  if (profile.role === "manager") redirect("/dashboard");

  const alerts = await getAlerts(profile);
  return <AlertsPanel initialAlerts={alerts} />;
}
