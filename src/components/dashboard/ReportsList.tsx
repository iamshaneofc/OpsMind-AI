"use client";

import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

const reports = [
  { name: "Executive Summary", date: "June 2026", type: "PDF" },
  { name: "Inventory Valuation", date: "Q2 2026", type: "CSV" },
  { name: "Fulfillment SLA Breaches", date: "Trailing 30 Days", type: "CSV" },
  { name: "Customer Acquisition Cost", date: "May 2026", type: "PDF" },
  { name: "Customer Churn Analysis", date: "Last 6 Months", type: "CSV" },
  { name: "Warehouse Throughput", date: "June 2026", type: "PDF" },
  { name: "Delayed Shipments Report", date: "Trailing 7 Days", type: "CSV" },
];

export function ReportsList() {
  const handleDownload = (report: typeof reports[0]) => {
    let content = "";
    let mimeType = "";
    
    if (report.type === "CSV") {
      content = "Date,Metric,Value\n2026-06-01,Sample,100\n2026-06-02,Sample,150";
      mimeType = "text/csv";
    } else {
      content = "MOCK PDF CONTENT\n-----------------\nThis is a generated mock PDF content for " + report.name;
      mimeType = "text/plain"; // Using plain text to mock PDF for demo purposes
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.name.replace(/\s+/g, '_').toLowerCase()}.${report.type.toLowerCase()}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
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
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full h-8 w-8"
              onClick={() => handleDownload(report)}
            >
              <Download size={16} />
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
