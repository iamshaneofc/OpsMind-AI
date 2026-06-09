import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AppRole } from "@/types/auth";
import { matchesOrdersView, type DashboardOrdersView } from "@/lib/orders-view-filters";
import { Download, FileText, X, Package, MoreHorizontal } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

const statusColor: Record<string, "default" | "warning" | "danger" | "success" | "secondary"> = {
  PENDING: "secondary",
  PROCESSING: "warning",
  SHIPPED: "default",
  DELIVERED: "success",
  DELAYED: "warning",
  CANCELLED: "danger",
};

interface OrdersTableProps {
  role: AppRole;
  rows: Array<{
    id: string | number;
    order_number: string;
    status: string;
    customer_name?: string | null;
    expected_delivery_date: string | null;
    created_at: string;
  }>;
}

const VISIBLE_LIMIT = 100;

function presetLabel(view: DashboardOrdersView): string {
  switch (view) {
    case "today": return "Today";
    case "in-progress": return "In progress";
    case "dispatch-ready": return "Dispatch queue";
    case "awaiting-factory": return "Awaiting factory";
    case "local-warehouse": return "Local warehouse";
    case "central-warehouse": return "Central warehouse";
    default: return "All";
  }
}

const getMockValue = (id: string | number) => {
  const num = typeof id === "string" ? parseInt(id.replace(/\D/g, '') || "1") : id;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((num % 1000) * 12.50 + 50);
};

const getMockPriority = (id: string | number) => {
  const num = typeof id === "string" ? parseInt(id.replace(/\D/g, '') || "1") : id;
  if (num % 5 === 0) return { label: "High", color: "text-destructive bg-destructive/10 border-destructive/20" };
  if (num % 3 === 0) return { label: "Medium", color: "text-warning bg-warning/10 border-warning/20" };
  return { label: "Standard", color: "text-muted-foreground bg-white/5 border-white/10" };
};

export function OrdersTable({ rows, role }: OrdersTableProps) {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [extraExpanded, setExtraExpanded] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<typeof rows[0] | null>(null);
  
  const showCustomerColumn = role === "admin" || role === "manager";
  const view = (searchParams?.get("view") ?? "all") as DashboardOrdersView;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (!matchesOrdersView({ status: r.status, created_at: r.created_at }, view)) return false;
      const okQuery = !q
        ? true
        : (r.order_number ?? "").toLowerCase().includes(q) ||
          (r.status ?? "").toLowerCase().includes(q) ||
          (r.customer_name ?? "").toLowerCase().includes(q);
      return okQuery;
    });
  }, [rows, query, view]);

  const visibleRows = showCustomerColumn && !extraExpanded ? filtered.slice(0, VISIBLE_LIMIT) : filtered;
  const hiddenCount = Math.max(0, filtered.length - VISIBLE_LIMIT);
  const hasHidden = showCustomerColumn && hiddenCount > 0;

  const renderRow = (row: (typeof filtered)[0]) => {
    const priority = getMockPriority(row.id);
    return (
      <TableRow 
        key={row.id} 
        className="cursor-pointer hover:bg-white/5 transition-colors group"
        onClick={() => setSelectedOrder(row)}
      >
        <TableCell className="font-medium text-white">{row.order_number}</TableCell>
        {showCustomerColumn ? (
          <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground group-hover:text-white transition-colors">
            {row.customer_name ?? "—"}
          </TableCell>
        ) : null}
        <TableCell>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${statusColor[row.status] === 'success' ? 'bg-emerald-500' : statusColor[row.status] === 'warning' ? 'bg-amber-500' : statusColor[row.status] === 'danger' ? 'bg-rose-500' : 'bg-primary'}`}></span>
            <span className="text-sm font-medium">{row.status}</span>
          </div>
        </TableCell>
        <TableCell>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${priority.color}`}>
            {priority.label}
          </span>
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {new Date(row.created_at).toLocaleDateString()}
        </TableCell>
        <TableCell className="font-medium text-white">
          {getMockValue(row.id)}
        </TableCell>
        <TableCell className="text-right">
          <Button variant="ghost" size="sm" className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            <MoreHorizontal size={16} />
          </Button>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <>
      <Card className="glass-card shadow-lg p-6">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
              Orders Database
              <Badge variant="default" className="border-primary/20 bg-primary/10 text-primary text-xs font-normal">
                {filtered.length} Records
              </Badge>
            </CardTitle>
            {view !== "all" ? (
              <p className="mt-1 text-xs text-primary flex items-center gap-1">
                <FilterIcon size={12} /> Active Preset: {presetLabel(view)}
              </p>
            ) : null}
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search orders, customers..."
                className="h-9 w-full sm:w-[280px] pl-9 bg-black/20 border-white/10 focus-visible:ring-primary/50"
              />
            </div>
            <div className="flex items-center gap-2 border-l border-white/10 pl-3">
              <Button variant="outline" size="sm" className="h-9 bg-white/5 border-white/10 hover:bg-white/10">
                <FileText size={14} className="mr-2" />
                CSV
              </Button>
              <Button variant="outline" size="sm" className="h-9 bg-white/5 border-white/10 hover:bg-white/10">
                <Download size={14} className="mr-2" />
                PDF
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-md border border-white/10 overflow-hidden">
          <Table>
            <TableHeader className="bg-black/40">
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-white">Order</TableHead>
                {showCustomerColumn ? <TableHead className="text-white">Customer</TableHead> : null}
                <TableHead className="text-white">Status</TableHead>
                <TableHead className="text-white">Priority</TableHead>
                <TableHead className="text-white">Date</TableHead>
                <TableHead className="text-white">Value</TableHead>
                <TableHead className="text-right text-white"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={showCustomerColumn ? 7 : 6} className="h-32 text-center text-muted-foreground">
                    No orders found matching your criteria.
                  </TableCell>
                </TableRow>
              ) : (
                visibleRows.map(renderRow)
              )}
            </TableBody>
          </Table>
        </div>

        {hasHidden && (
          <div className="mt-4 flex justify-center">
            <Button
              variant="ghost"
              onClick={() => setExtraExpanded(!extraExpanded)}
              className="text-primary hover:text-primary hover:bg-primary/10"
            >
              {extraExpanded ? "Show less" : `View all ${hiddenCount} hidden orders`}
            </Button>
          </div>
        )}
      </Card>

      <AnimatePresence>
        {selectedOrder && (
          <div className="fixed inset-0 z-50 overflow-hidden" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
              onClick={() => setSelectedOrder(null)} 
            />
            
            <div className="fixed inset-y-0 right-0 max-w-full flex">
              <motion.div 
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="w-screen max-w-md transform transition-all"
              >
                <div className="flex h-full flex-col overflow-y-auto bg-slate-950 border-l border-white/10 shadow-2xl">
                  <div className="px-6 py-6 sm:px-8 flex items-center justify-between border-b border-white/5 bg-black/20">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 text-primary">
                        <Package size={20} />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-white" id="slide-over-title">{selectedOrder.order_number}</h2>
                        <p className="text-sm text-muted-foreground">{new Date(selectedOrder.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="rounded-md text-muted-foreground hover:text-white focus:outline-none"
                      onClick={() => setSelectedOrder(null)}
                    >
                      <span className="sr-only">Close panel</span>
                      <X className="h-6 w-6" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="relative flex-1 px-6 py-6 sm:px-8 space-y-8">
                    <div>
                      <h3 className="text-sm font-medium text-white mb-4 uppercase tracking-wider">Fulfillment Status</h3>
                      <div className="relative">
                        <div className="absolute left-3 top-0 bottom-0 w-px bg-white/10"></div>
                        <div className="space-y-6 relative">
                          <div className="flex items-start gap-4">
                            <div className="h-6 w-6 rounded-full bg-primary/20 border border-primary text-primary flex items-center justify-center relative z-10 mt-0.5">
                              <span className="h-2 w-2 rounded-full bg-primary"></span>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white">Order Placed</p>
                              <p className="text-xs text-muted-foreground">{new Date(selectedOrder.created_at).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-4">
                            <div className={`h-6 w-6 rounded-full flex items-center justify-center relative z-10 mt-0.5 ${selectedOrder.status !== 'PENDING' ? 'bg-primary/20 border-primary text-primary border' : 'bg-black border border-white/20'}`}>
                              <span className={`h-2 w-2 rounded-full ${selectedOrder.status !== 'PENDING' ? 'bg-primary' : 'bg-transparent'}`}></span>
                            </div>
                            <div>
                              <p className={`text-sm font-medium ${selectedOrder.status !== 'PENDING' ? 'text-white' : 'text-muted-foreground'}`}>Processing</p>
                              <p className="text-xs text-muted-foreground">Warehouse assignment</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-4">
                            <div className={`h-6 w-6 rounded-full flex items-center justify-center relative z-10 mt-0.5 ${selectedOrder.status === 'SHIPPED' || selectedOrder.status === 'DELIVERED' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500 border' : 'bg-black border border-white/20'}`}>
                              <span className={`h-2 w-2 rounded-full ${selectedOrder.status === 'SHIPPED' || selectedOrder.status === 'DELIVERED' ? 'bg-emerald-500' : 'bg-transparent'}`}></span>
                            </div>
                            <div>
                              <p className={`text-sm font-medium ${selectedOrder.status === 'SHIPPED' || selectedOrder.status === 'DELIVERED' ? 'text-white' : 'text-muted-foreground'}`}>Shipped</p>
                              <p className="text-xs text-muted-foreground">In transit to destination</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                        <p className="text-xs text-muted-foreground mb-1">Expected Delivery</p>
                        <p className="text-sm font-medium text-white">{selectedOrder.expected_delivery_date || "Pending"}</p>
                      </div>
                      <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                        <p className="text-xs text-muted-foreground mb-1">Total Value</p>
                        <p className="text-sm font-medium text-emerald-500">{getMockValue(selectedOrder.id)}</p>
                      </div>
                    </div>

                    {showCustomerColumn && (
                      <div>
                        <h3 className="text-sm font-medium text-white mb-3 uppercase tracking-wider">Customer Details</h3>
                        <div className="p-4 rounded-xl bg-black/20 border border-white/10">
                          <p className="text-sm font-semibold text-white">{selectedOrder.customer_name}</p>
                          <p className="text-xs text-muted-foreground mt-1">Enterprise Account · Tier 1</p>
                          <Button variant="ghost" className="px-0 text-primary h-auto mt-2 text-xs hover:bg-transparent">View CRM Profile</Button>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="p-6 border-t border-white/5 bg-black/20 flex gap-3">
                    <Button className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90">
                      Manage Order
                    </Button>
                    <Button variant="outline" className="flex-1 bg-transparent border-white/10 hover:bg-white/5">
                      Contact
                    </Button>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

function FilterIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  )
}

function SearchIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
    </svg>
  )
}
