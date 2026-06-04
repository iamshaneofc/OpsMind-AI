import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { FileText, Download, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireAuthenticatedUser } from "@/services/auth";

export default async function ReportsPage() {
  await requireAuthenticatedUser();

  const reports = [
    { name: "Executive Summary", date: "June 2026", type: "PDF" },
    { name: "Inventory Valuation", date: "Q2 2026", type: "CSV" },
    { name: "Fulfillment SLA Breaches", date: "Trailing 30 Days", type: "CSV" },
    { name: "Customer Acquisition Cost", date: "May 2026", type: "PDF" },
  ];

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

      <div className="grid gap-4 md:grid-cols-2">
        {reports.map((report) => (
          <Card key={report.name} className="glass-card flex flex-col p-5 hover:border-primary/30 group">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                  <FileText size={20} />
                </div>
                <div>
                  <CardTitle className="text-base font-medium text-white">{report.name}</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">{report.date} · {report.type}</CardDescription>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full h-8 w-8">
                <Download size={16} />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
