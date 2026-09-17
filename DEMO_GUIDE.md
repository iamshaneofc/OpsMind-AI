# OpsMind Operations AI - Demo Guide

## Quick Start

**URL:** `http://localhost:3001/login`

**All demo users share the same password:** `OpsMind@12345`

---

## Authentication Credentials

### Super Admin
- **Email:** `super.admin@opsmindchemicals.com`
- **Role:** Super Admin (ADMIN)
- **Access:** Full system access - all orders, all companies, all warehouses, all data

### Distributors
| User | Email | Company |
|------|-------|---------|
| OpsMind Distributor | `distributor@opsmindchemicals.com` | Bharat Auto Parts Distributors |
| Pradeep | `pradeep@opsmindchemicals.com` | Chennai Motor Components Ltd |
| Rohit | `rohit@opsmindchemicals.com` | Delhi Automotive Traders |

### Warehouse Incharge
| User | Email | Warehouse |
|------|-------|-----------|
| OpsMind Warehouse | `warehouse@opsmindchemicals.com` | Western Region Hub (Mumbai) |
| Mumbai Warehouse | `warehouse.mumbai@opsmindchemicals.com` | Central Warehouse (Pune) |

---

## Demo Data Summary

| Entity | Count |
|--------|-------|
| Customers | 10 |
| Orders | 100 (10 per customer) |
| Order Items | 228 |
| Products | 15 (automobile parts) |
| Warehouses | 5 (Indian cities) |
| Invoices | 100 |
| Inventory Movements | 212 |
| Alerts | 10 |

### Order Status Distribution
| Status | Count | Description |
|--------|-------|-------------|
| DELIVERED | 25 | Completed deliveries |
| IN_PREPARATION | 22 | Being prepared at warehouse |
| PROCESSING | 17 | Actively being processed |
| AWAITING_FACTORY | 12 | Waiting for factory allocation |
| DISPATCH_READY | 10 | Ready for dispatch |
| DELAYED | 6 | Past expected delivery date |
| IN_TRANSIT | 5 | Shipped, in transit |
| CANCELLED | 3 | Cancelled orders |

### Invoice Status Distribution
| Status | Count |
|--------|-------|
| PAID | 53 |
| UNPAID | 31 |
| OVERDUE | 16 |

### Products (Automobile Parts)
| Product | SKU | Price (INR) |
|---------|-----|-------------|
| Front Brake Pad Set | BAP-FBP-001 | 1,500 |
| Rear Brake Pad Set | BAP-RBP-002 | 1,200 |
| Oil Filter - Petrol | BAP-OFL-003 | 250 |
| Oil Filter - Diesel | BAP-OFD-004 | 300 |
| Air Filter Element | BAP-AFE-005 | 450 |
| Spark Plug Set (4 pcs) | BAP-SPK-006 | 600 |
| Diesel Injector Nozzle | BAP-DIN-007 | 3,500 |
| Clutch Plate Assembly | BAP-CPA-008 | 4,000 |
| Drive Belt - Alternator | BAP-DBA-009 | 380 |
| Coolant 1L Concentrate | BAP-CLT-010 | 300 |
| Brake Fluid DOT4 500ml | BAP-BFD-011 | 450 |
| Engine Oil 5W30 4L | BAP-EO5-012 | 3,200 |
| Transmission Gear Oil 1L | BAP-TGO-013 | 650 |
| Wheel Bearing Set | BAP-WBS-014 | 2,100 |
| Shock Absorber Front | BAP-SAF-015 | 2,800 |

### Customers
| Customer | City |
|----------|------|
| Mumbai Motors Workshop | Mumbai |
| Chennai Auto Care Center | Chennai |
| Delhi Car Services Pvt Ltd | New Delhi |
| Kolkata Garage Hub | Kolkata |
| Pune Auto Works | Pune |
| Bangalore Car Clinic | Bangalore |
| Hyderabad Motor Garage | Hyderabad |
| Ahmedabad Auto Solutions | Ahmedabad |
| Jaipur Car Care Center | Jaipur |
| Lucknow Motor Works | Lucknow |

---

## Role-Based Access

### Super Admin
- All orders from all companies
- All inventory across all warehouses
- Full chatbot access (orders, inventory, invoices, analytics)
- All alerts

### Distributor
- Only own company orders
- No inventory access
- Chatbot: track own orders only

### Warehouse
- Orders assigned to their warehouse
- Inventory at their warehouse only
- Chatbot: warehouse orders + inventory

---

## Testing Scenarios

### 1. Dashboard Metrics
Login as Super Admin - verify:
- Total Orders: 100
- Revenue figures populated
- Customer count: 10
- Order status chart shows distribution
- Pipeline chart shows flow

### 2. Order Tracking
- Login as any distributor
- Orders tab shows only their company's orders
- Status badges (Delivered, Processing, Delayed, etc.)

### 3. AI Chatbot
Try these queries:
- "Show all delayed orders"
- "What's the stock for Front Brake Pad Set?"
- "Revenue by distributor this quarter"
- "Which products are below reorder level?"
- "All orders from Mumbai Motors Workshop"

### 4. Role Restriction
- Login as distributor
- Try accessing inventory - should be restricted
- Chatbot: "Check inventory" - AI should decline

---

## Troubleshooting

**No data showing:** Run `npm run seed:demo`
**Chatbot not responding:** Check OpenAI API key in .env
**Login fails:** Ensure password is `OpsMind@12345`

---

**Last Updated:** 2026-09-15
**Version:** 2.0.0
