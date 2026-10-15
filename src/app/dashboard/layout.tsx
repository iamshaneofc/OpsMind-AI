import { Sidebar } from "@/components/dashboard/sidebar";
import { TopNav } from "@/components/dashboard/top-nav";
import { AskAssistantFab } from "@/components/dashboard/ask-assistant-fab";
import { NavigationLoader } from "@/components/dashboard/navigation-loader";
import { CommandPalette } from "@/components/command-palette";
import { PreferencesApplier } from "@/components/preferences-applier";
import { requireAuthenticatedUser } from "@/services/auth";
import { getActiveIndustry } from "@/lib/industry-server";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { profile } = await requireAuthenticatedUser();
  const industry = getActiveIndustry();

  return (
    <div className="h-[100dvh] overflow-hidden">
      <PreferencesApplier />
      <NavigationLoader />
      <Sidebar role={profile.role} />
      <main className="scrollbar-none h-full overflow-y-auto p-4 lg:ml-[272px]">
        <TopNav profile={profile} industry={industry} />
        {children}
      </main>
      <AskAssistantFab />
      <CommandPalette role={profile.role} />
    </div>
  );
}
