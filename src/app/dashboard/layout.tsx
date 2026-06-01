import { Sidebar } from "@/components/dashboard/sidebar";
import { TopNav } from "@/components/dashboard/top-nav";
import { NavigationLoader } from "@/components/dashboard/navigation-loader";
import { requireAuthenticatedUser } from "@/services/auth";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { profile } = await requireAuthenticatedUser();

  return (
    <div className="h-[100dvh] overflow-hidden">
      <NavigationLoader />
      <Sidebar role={profile.role} />
      <main className="h-full overflow-y-auto p-4 lg:ml-[280px]">
        <TopNav profile={profile} />
        {children}
      </main>
    </div>
  );
}
