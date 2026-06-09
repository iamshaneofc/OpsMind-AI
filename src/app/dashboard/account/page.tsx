import { requireAuthenticatedUser } from "@/services/auth";
import { AccountClient } from "./account-client";

export default async function AccountPage() {
  const { profile } = await requireAuthenticatedUser();

  return (
    <AccountClient 
      initialName={profile.full_name} 
      email={profile.email} 
      role={profile.role}
    />
  );
}
