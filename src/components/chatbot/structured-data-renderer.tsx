"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface OrderItem {
  order_number?: string;
  order_id?: number;
  status?: string;
  expected_delivery_date?: string | null;
  warehouse_id?: number | null;
  warehouse_name?: string | null;
  company_id?: number | null;
}

interface InventoryItem {
  product_name?: string | null;
  sku?: string | null;
  available_qty?: number;
  available_quantity?: number;
  reorder_level?: number;
  warehouse_id?: number | null;
  warehouse_name?: string | null;
}

interface InvoiceItem {
  invoice_id?: string | number;
  invoice_number?: string;
  invoice_date?: string;
  invoice_total_amount?: number;
  total_amount?: number;
  base_amount?: number;
  tax_amount?: number;
  discount_amount?: number;
  customer_full_name?: string;
  customer_name?: string;
  customer_email?: string;
  customer_telephone?: string;
  status?: string;
  confirmed?: boolean;
  company_id?: string | number;
  company_name?: string;
  transport_name?: string;
  vehicle_number?: string;
  date_of_removal?: string;
  items?: Array<{
    line_number?: number;
    product_catalogue_number?: string;
    product_description?: string;
    sku?: string | null;
    status?: string | null;
    eta?: string | null;
    invoice_date?: string | null;
    quantity?: number;
    unit_price?: number;
    line_total?: number;
  }>;
  items_count?: number;
  linked_orders?: Array<{
    order_number?: string;
    order_date?: string;
    customer_po_number?: string;
    order_total_amount?: number;
  }>;
  orders_count?: number;
}

interface ProductCard {
  product?: {
    product_id?: number | null;
    product_name?: string | null;
    sku?: string | null;
  };
  warehouse?: {
    warehouse_id?: number | null;
    warehouse_name?: string | null;
    scope_note?: string | null;
  } | null;
  availability?: {
    available?: boolean;
    available_qty?: number | null;
    expected_available_by?: string | null;
  };
  offer_other_warehouses?: boolean;
  other_warehouses?: Array<{
    warehouse_id?: number | null;
    warehouse_name?: string | null;
    available_qty?: number | null;
  }>;
  order_history?: {
    latest_orders?: Array<{
      order_number?: string;
      status?: string;
      customer_name?: string | null;
      warehouse_name?: string | null;
      eta?: string | null;
      order_date?: string | null;
    }>;
    orders_count?: number;
    should_reorder?: boolean;
    reorder_prompt?: string | null;
    last_order_date?: string | null;
  };
  similar_products?: Array<{
    product_id?: number | null;
    sku?: string | null;
    product_name?: string | null;
    available_qty?: number | null;
  }>;
}

interface StructuredDataRendererProps {
  data: unknown;
  type?: "orders" | "inventory" | "invoices" | "auto";
}

const statusColors: Record<string, "default" | "secondary" | "warning" | "danger" | "success"> = {
  // 7 canonical lifecycle states
  ORDER_RECEIVED: "secondary",
  ALLOCATED_LOCAL_WAREHOUSE: "default",
  ALLOCATED_CENTRAL_WAREHOUSE: "default",
  IN_PREPARATION: "warning",
  AWAITING_FACTORY: "warning",
  DISPATCH_READY: "default",
  DELIVERED: "success",
  // Legacy / aliases
  DISPATCHED: "success",
  IN_TRANSIT: "default",
  CANCELLED: "danger",
  PENDING: "secondary",
};


function isOrderArray(data: unknown): data is OrderItem[] {
  return (
    Array.isArray(data) &&
    data.length > 0 &&
    (typeof data[0] === "object" && data[0] !== null && ("order_number" in data[0] || "order_id" in data[0]))
  );
}

function isInventoryArray(data: unknown): data is InventoryItem[] {
  return (
    Array.isArray(data) &&
    data.length > 0 &&
    (typeof data[0] === "object" &&
      data[0] !== null &&
      ("product_name" in data[0] || "sku" in data[0] || "available_qty" in data[0] || "available_quantity" in data[0]))
  );
}

function isInvoiceArray(data: unknown): data is InvoiceItem[] {
  return (
    Array.isArray(data) &&
    data.length > 0 &&
    (typeof data[0] === "object" &&
      data[0] !== null &&
      ("invoice_number" in data[0] || "invoice_id" in data[0] || "invoice_date" in data[0]))
  );
}

function isProductCardObject(data: unknown): data is ProductCard {
  if (!data || Array.isArray(data) || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if (d.product == null || typeof d.product !== "object") return false;
  // LLMs sometimes emit only order_history; treat as product card and default availability in the UI.
  return "availability" in d || "order_history" in d;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

export function StructuredDataRenderer({ data, type = "auto" }: StructuredDataRendererProps) {
  if (!data || (Array.isArray(data) && data.length === 0)) {
    return (
      <div className="rounded-xl border border-border/50 bg-muted/20 p-5 text-sm text-muted-foreground shadow-sm">
        No data available.
      </div>
    );
  }

  if (type === "auto" && isProductCardObject(data)) {
    const card = data as ProductCard;
    const availability = card.availability ?? {
      available: false,
      available_qty: null as number | null,
      expected_available_by: null as string | null,
    };
    const sku = card.product?.sku ?? card.product?.product_name ?? "-";
    const warehouseName = card.warehouse?.warehouse_name ?? "-";
    const qty = availability.available_qty ?? null;
    const available = availability.available ?? false;
    const expected = availability.expected_available_by ?? null;
    const statusText = available ? "Available" : "Out of stock";

    return (
      <Card className="border-border/50 bg-background/50 shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border/40 bg-muted/20 pb-4 pt-4">
          <CardTitle className="text-base tracking-tight">Product Catalog</CardTitle>
          <CardDescription className="text-sm">
            {card.product?.product_name ?? "Product"} <span className="text-muted-foreground/70">({sku})</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="space-y-6">
            {card.order_history?.latest_orders && card.order_history.latest_orders.length > 0 ? (
              <div>
                <div className="mb-3 text-[13px] font-semibold text-foreground/80 uppercase tracking-wider">Latest Orders</div>
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/40 hover:bg-transparent text-xs">
                      <TableHead className="text-muted-foreground">Order Ref</TableHead>
                      <TableHead className="text-muted-foreground">Distributor</TableHead>
                      <TableHead className="text-muted-foreground">Status</TableHead>
                      <TableHead className="text-muted-foreground">Warehouse</TableHead>
                      <TableHead className="text-muted-foreground">Delivered / ETA</TableHead>
                      <TableHead className="text-muted-foreground">Order date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {card.order_history.latest_orders.map((o, idx) => (
                      <TableRow key={`${o.order_number ?? "order"}-${idx}`} className="border-border/40 text-sm">
                        <TableCell className="font-medium text-foreground">{o.order_number ?? "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{o.customer_name ?? "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{o.status ?? "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{o.warehouse_name ?? "-"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {o.eta ? formatDate(o.eta) : "-"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(o.order_date)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}

            <div>
              <div className="mb-1 text-[13px] font-semibold text-foreground/80 uppercase tracking-wider">Availability Overview</div>
              <p className="mb-3 text-xs text-muted-foreground">
                Stock in <span className="font-semibold text-foreground/70">{warehouseName !== "-" ? warehouseName : "your assigned warehouse"}</span>
                {!available && card.other_warehouses && card.other_warehouses.length > 0
                  ? " — not available here, but found in alternative locations below."
                  : "."}
              </p>
              {card.warehouse?.scope_note ? (
                <p className="mb-3 text-xs text-teal-500/90">{card.warehouse.scope_note}</p>
              ) : null}
              <Table>
                <TableHeader>
                  <TableRow className="border-border/40 hover:bg-transparent text-xs">
                    <TableHead className="text-muted-foreground">SKU</TableHead>
                    <TableHead className="text-muted-foreground">Your Warehouse</TableHead>
                    <TableHead className="text-muted-foreground">Qty Here</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-muted-foreground">Expected By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="border-border/40 text-sm">
                    <TableCell className="font-medium text-foreground">{sku}</TableCell>
                    <TableCell className="text-foreground/90">{warehouseName}</TableCell>
                    <TableCell className="text-foreground/90">{qty ?? 0}</TableCell>
                    <TableCell>
                      <Badge variant={available ? "success" : "secondary"} className="rounded-md font-medium px-2 py-0.5 shadow-none text-xs">
                        {available ? "In Stock" : "Not in this warehouse"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(expected)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              {card.offer_other_warehouses && !card.other_warehouses?.length ? (
                <p className="mt-3 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                  This product is not available in your selected warehouse. Reply to search other locations.
                </p>
              ) : null}
            </div>

            {card.other_warehouses && card.other_warehouses.length > 0 ? (
              <div>
                <div className="mb-3 text-[13px] font-semibold text-foreground/80 uppercase tracking-wider">Alternative Locations</div>
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/40 hover:bg-transparent text-xs">
                      <TableHead className="text-muted-foreground">Warehouse</TableHead>
                      <TableHead className="text-muted-foreground">Qty Available</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {card.other_warehouses.map((w, idx) => (
                      <TableRow key={`${w.warehouse_id ?? idx}-${idx}`} className="border-border/40 text-sm">
                        <TableCell className="font-medium text-foreground">{w.warehouse_name ?? `Warehouse ${w.warehouse_id ?? "-"}`}</TableCell>
                        <TableCell className="text-foreground/90">{w.available_qty ?? 0}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}

            {card.order_history?.should_reorder && card.order_history.reorder_prompt ? (
              <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-4">
                <div className="mb-1 text-sm font-semibold text-teal-500">Inventory Alert</div>
                <p className="text-[13px] text-muted-foreground">{card.order_history.reorder_prompt}</p>
              </div>
            ) : null}

            {card.similar_products && card.similar_products.length > 0 ? (
              <div>
                <div className="mb-3 text-[13px] font-semibold text-foreground/80 uppercase tracking-wider">Similar Products</div>
                <p className="mb-3 text-xs text-muted-foreground">Other products with a similar name that may interest you.</p>
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/40 hover:bg-transparent text-xs">
                      <TableHead className="text-muted-foreground">Product Name</TableHead>
                      <TableHead className="text-muted-foreground">SKU</TableHead>
                      <TableHead className="text-muted-foreground">Total Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {card.similar_products.map((sp, idx) => (
                      <TableRow key={`${sp.product_id ?? idx}-${idx}`} className="border-border/40 text-sm">
                        <TableCell className="font-medium text-foreground max-w-[260px] truncate" title={sp.product_name ?? ""}>{sp.product_name ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">{sp.sku ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={(sp.available_qty ?? 0) > 0 ? "success" : "secondary"} className="rounded-md font-medium px-2 py-0.5 shadow-none text-xs">
                            {(sp.available_qty ?? 0) > 0 ? `${sp.available_qty} in stock` : "Out of stock"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (type === "orders" || (type === "auto" && isOrderArray(data))) {
    const orders = data as OrderItem[];
    return (
      <Card className="border-border/50 bg-background/50 shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border/40 bg-muted/20 pb-4 pt-4">
          <CardTitle className="text-base tracking-tight">Active Orders</CardTitle>
          <CardDescription className="text-sm">Found {orders.length} order{orders.length === 1 ? "" : "s"} matching your criteria</CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="space-y-3">
            {orders.map((order, idx) => (
              <div
                key={order.order_id ?? order.order_number ?? idx}
                className="rounded-xl border border-border/40 bg-muted/20 p-4 transition-colors hover:bg-muted/30"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[15px] font-semibold text-foreground tracking-tight">{order.order_number ?? `Order #${order.order_id}`}</span>
                  <Badge variant={statusColors[order.status ?? ""] ?? "secondary"} className="text-xs px-2.5 py-0.5 rounded shadow-none font-medium">
                    {order.status ?? "UNKNOWN"}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 gap-1.5 text-[13px] text-muted-foreground">
                  {order.warehouse_name && (
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground/70">Location:</span> 
                      <span className="text-foreground/90">{order.warehouse_name}</span>
                    </div>
                  )}
                  {order.expected_delivery_date && (
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground/70">Estimated delivery:</span> 
                      <span className="text-foreground/90">{formatDate(order.expected_delivery_date)}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (type === "inventory" || (type === "auto" && isInventoryArray(data))) {
    const inventory = data as InventoryItem[];
    return (
      <Card className="border-border/50 bg-background/50 shadow-sm overflow-hidden min-w-[300px]">
        <CardHeader className="border-b border-border/40 bg-muted/20 pb-4 pt-4">
          <CardTitle className="text-base tracking-tight">Inventory Status</CardTitle>
          <CardDescription className="text-sm">Viewing {inventory.length} item{inventory.length === 1 ? "" : "s"}</CardDescription>
        </CardHeader>
        <CardContent className="pt-5 p-0 sm:p-5">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/40 hover:bg-transparent text-xs">
                  <TableHead className="text-muted-foreground">Product</TableHead>
                  <TableHead className="text-muted-foreground">SKU Code</TableHead>
                  <TableHead className="text-muted-foreground">In Stock</TableHead>
                  <TableHead className="text-muted-foreground">Health</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventory.map((item, idx) => {
                  const qty = item.available_qty ?? item.available_quantity ?? 0;
                  const reorder = item.reorder_level ?? 30;
                  const isLow = qty <= reorder;
                  return (
                    <TableRow key={idx} className="border-border/40 text-sm hover:bg-muted/20 transition-colors">
                      <TableCell className="font-medium text-foreground">{item.product_name ?? "Unknown Product"}</TableCell>
                      <TableCell className="text-muted-foreground">{item.sku ?? "-"}</TableCell>
                      <TableCell className="text-foreground/90 font-medium">{qty}</TableCell>
                      <TableCell>
                        <Badge variant={isLow ? "danger" : "success"} className="rounded text-xs px-2 py-0.5 shadow-none font-medium">
                          {isLow ? "Low Stock" : "Healthy"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (type === "invoices" || (type === "auto" && isInvoiceArray(data))) {
    const invoices = data as InvoiceItem[];
    return (
      <Card className="border-border/50 bg-background/50 shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border/40 bg-muted/20 pb-4 pt-4">
          <CardTitle className="text-base tracking-tight">Invoice Records</CardTitle>
          <CardDescription className="text-sm">Showing {invoices.length} matched document{invoices.length === 1 ? "" : "s"}</CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="space-y-6">
            {invoices.map((invoice, idx) => {
              const amount = invoice.invoice_total_amount || invoice.total_amount || 0;
              const invoiceNum = invoice.invoice_number || `INV-${invoice.invoice_id}`;
              const customer = invoice.customer_full_name || invoice.customer_name || "Unknown Entity";
              
              return (
                <div
                  key={invoice.invoice_id ?? idx}
                  className="rounded-xl border border-border/40 bg-muted/10 p-5 transition-colors hover:bg-muted/20"
                >
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-3">
                        <span className="text-[17px] font-semibold tracking-tight text-foreground">{invoiceNum}</span>
                        {invoice.confirmed !== undefined && (
                          <Badge variant={invoice.confirmed ? "success" : "secondary"} className="rounded px-2 py-0.5 text-[11px] uppercase tracking-wider shadow-none font-medium">
                            {invoice.confirmed ? "Confirmed" : "Draft"}
                          </Badge>
                        )}
                      </div>
                      <div className="text-[13px] text-muted-foreground">Generated {formatDate(invoice.invoice_date ?? null)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[13px] text-muted-foreground mb-0.5 uppercase tracking-wider font-semibold">Total Value</div>
                      <div className="text-xl font-bold tracking-tight text-foreground">
                        {typeof amount === "number" ? `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : amount}
                      </div>
                    </div>
                  </div>

                  <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Distributor</span>
                      <div className="text-[15px] font-medium text-foreground">{customer}</div>
                      {invoice.company_name && <div className="text-[13px] text-foreground/80">{invoice.company_name}</div>}
                    </div>
                    
                    <div className="flex flex-col gap-1.5 font-mono text-[13px] text-foreground/80 bg-background rounded-lg border border-border/40 p-3 h-fit">
                      {invoice.customer_email && (
                        <div className="flex justify-between w-full">
                          <span className="text-muted-foreground mr-4">E:</span>
                          <span className="truncate">{invoice.customer_email}</span>
                        </div>
                      )}
                      {invoice.customer_telephone && (
                        <div className="flex justify-between w-full">
                          <span className="text-muted-foreground mr-4">T:</span>
                          <span className="truncate">{invoice.customer_telephone}</span>
                        </div>
                      )}
                      {invoice.transport_name && (
                        <div className="flex justify-between w-full border-t border-border/40 pt-1 mt-1">
                          <span className="text-muted-foreground mr-4">L:</span>
                          <span className="truncate">{invoice.transport_name} {invoice.vehicle_number ? `(${invoice.vehicle_number})` : ""}</span>
                        </div>
                      )}
                    </div>

                    {(invoice.base_amount || invoice.tax_amount || invoice.discount_amount) && (
                      <div className="col-span-1 sm:col-span-2 mt-2 flex flex-col gap-2 rounded-lg bg-muted/40 p-3 text-[13px]">
                        {invoice.base_amount && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground font-medium">Subtotal</span>
                            <span className="font-medium text-foreground">₹{invoice.base_amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        )}
                        {invoice.tax_amount && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground font-medium">Taxes</span>
                            <span className="font-medium text-foreground">₹{invoice.tax_amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        )}
                        {invoice.discount_amount && (
                          <div className="flex justify-between border-t border-border/40 pt-2 mt-1">
                            <span className="text-muted-foreground font-medium">Discount applied</span>
                            <span className="font-semibold text-teal-500">-₹{invoice.discount_amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {invoice.items && invoice.items.length > 0 && (
                    <div className="mb-5 border-t border-border/40 pt-5">
                      <div className="mb-3 text-[13px] font-semibold text-foreground/80 uppercase tracking-wider">
                        Line Items <span className="text-muted-foreground ml-1">({invoice.items_count || invoice.items.length})</span>
                      </div>
                      <div className="rounded-lg border border-border/40 overflow-hidden text-sm">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/40 border-border/40 text-xs hover:bg-muted/40">
                              <TableHead className="text-muted-foreground">Product Detail</TableHead>
                              <TableHead className="w-20 text-right text-muted-foreground">Qty</TableHead>
                              <TableHead className="w-32 text-muted-foreground">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {invoice.items.map((item, itemIdx) => (
                              <TableRow key={itemIdx} className="border-border/40 hover:bg-muted/20">
                                <TableCell className="font-medium text-foreground">
                                  {item.sku ?? item.product_catalogue_number ?? item.product_description ?? "-"}
                                </TableCell>
                                <TableCell className="text-right text-foreground/90 font-mono">{item.quantity ?? 0}</TableCell>
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span className="text-foreground/80">{item.status ?? "Processed"}</span>
                                    {item.eta && <span className="text-[11px] text-muted-foreground mt-0.5">Estimated delivery: {formatDate(item.eta)}</span>}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {invoice.linked_orders && invoice.linked_orders.length > 0 && (
                    <div className="border-t border-border/40 pt-5">
                      <div className="mb-3 text-[13px] font-semibold text-foreground/80 uppercase tracking-wider">
                        Associated Sales Orders <span className="text-muted-foreground ml-1">({invoice.orders_count || invoice.linked_orders.length})</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {invoice.linked_orders.map((order, orderIdx) => (
                          <div key={orderIdx} className="rounded-lg border border-border/40 bg-background/50 p-3.5 hover:border-teal-500/20 transition-colors">
                            <div className="mb-2 flex items-center justify-between">
                              <span className="font-semibold text-foreground">{order.order_number || "Unknown"}</span>
                              {order.order_date && (
                                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{formatDate(order.order_date)}</span>
                              )}
                            </div>
                            <div className="flex flex-col gap-1 text-[13px]">
                              {order.customer_po_number && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">PO Ref</span>
                                  <span className="font-mono text-foreground/80">{order.customer_po_number}</span>
                                </div>
                              )}
                              {order.order_total_amount && (
                                <div className="flex justify-between mt-1 border-t border-border/40 pt-1.5">
                                  <span className="text-muted-foreground">Value</span>
                                  <span className="font-medium text-foreground">₹{order.order_total_amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
