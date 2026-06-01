import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { requireAuthenticatedUser } from "@/services/auth";
import { roleLabel } from "@/services/operations";

export default async function AccountPage() {
  const { profile } = await requireAuthenticatedUser();

  return (
    <Card>
      <CardTitle>Account</CardTitle>
      <CardDescription className="mt-1">Identity and access context for this workspace</CardDescription>
      <div className="mt-4 space-y-2 text-sm">
        <p>Email: {profile.email}</p>
        <p>Role: {roleLabel(profile.role)}</p>
        <p>Company: {profile.company_id ?? "Not assigned"}</p>
        <p>Warehouse: {profile.warehouse_id ?? "Not assigned"}</p>
      </div>
    </Card>
  );
}
