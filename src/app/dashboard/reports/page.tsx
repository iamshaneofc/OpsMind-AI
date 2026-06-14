import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireAuthenticatedUser } from "@/services/auth";
import { ReportsList } from "@/components/dashboard/ReportsList";

export default async function ReportsPage() {
  await requireAuthenticatedUser();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="bg-gradient-to-br from-white to-white/50 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
            Executive Reports
          </h1>
          <p className="text-sm text-muted-foreground">
            Downloadable operational summaries and financial breakdowns.
          </p>
        </div>
        <Button variant="outline" className="w-full sm:w-auto bg-white/5 border-white/10 text-white hover:bg-white/10">
          <Filter size={16} className="mr-2" />
          Filter Reports
        </Button>
      </div>

      <ReportsList />
    </div>
  );
}
