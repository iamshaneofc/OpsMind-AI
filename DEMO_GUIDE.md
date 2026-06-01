# SRL Operations AI - Demo Guide

## 🚀 Quick Start

Welcome to the SRL Operations AI platform! This guide provides all the authentication credentials and role-based authorizations for testing the system.

---

## 🔐 Authentication Credentials

**All demo users share the same password:** `Srl@12345`

### Super Admin
- **Email:** `super.admin@srlchemicals.com`
- **Password:** `Srl@12345`
- **Role:** Super Admin
- **Access Level:** Full system access

### Distributors

#### 1. SRL Distributor (North Axis Distributors)
- **Email:** `distributor@srlchemicals.com`
- **Password:** `Srl@12345`
- **Role:** Distributor
- **Company:** North Axis Distributors

#### 2. Pradeep (Pradeep Chemicals)
- **Email:** `pradeep@srlchemicals.com`
- **Password:** `Srl@12345`
- **Role:** Distributor
- **Company:** Pradeep Chemicals

#### 3. Rohit (Rohit Trading Co)
- **Email:** `rohit@srlchemicals.com`
- **Password:** `Srl@12345`
- **Role:** Distributor
- **Company:** Rohit Trading Co

### Warehouse Incharge

#### 1. Delhi Central Warehouse
- **Email:** `warehouse@srlchemicals.com`
- **Password:** `Srl@12345`
- **Role:** Warehouse Incharge
- **Warehouse:** Delhi Central

#### 2. Mumbai Central Warehouse
- **Email:** `warehouse.mumbai@srlchemicals.com`
- **Password:** `Srl@12345`
- **Role:** Warehouse Incharge
- **Warehouse:** SRL Central Warehouse (Mumbai)

---

## 🔒 Role-Based Authorizations

### Super Admin
**Full System Access**

✅ **Dashboard Access:**
- View all operational metrics
- See orders across all companies
- Monitor inventory across all warehouses
- View all alerts and notifications

✅ **Orders:**
- View all orders from all distributors
- Track order status across the system
- View delayed orders
- Access order history

✅ **Inventory:**
- View inventory across all warehouses
- Check stock levels
- View low stock alerts
- Monitor warehouse inventory

✅ **Chatbot:**
- Query any order in the system
- Check inventory at any warehouse
- View delayed orders
- Access dispatch queue
- Get operational insights

✅ **Alerts:**
- View all system alerts
- Critical, warning, and info alerts
- Order-related alerts
- Inventory alerts

---

### Distributor
**Limited Access - Own Company Data Only**

✅ **Dashboard Access:**
- View own company metrics
- See own pending orders
- Track own order status

✅ **Orders:**
- View only own company orders
- Track own order status
- View own delayed orders
- Cannot see other distributors' orders

❌ **Inventory:**
- **NO ACCESS** - Distributors cannot view inventory data
- Cannot check warehouse stock levels
- Cannot access inventory-related queries in chatbot

✅ **Chatbot:**
- Track own orders
- Check own order status
- View own pending orders
- View own delayed orders
- **Cannot query inventory** (will be declined by AI)

❌ **Alerts:**
- View only alerts related to own orders
- Cannot see other distributors' alerts

**Chatbot Suggestions for Distributors:**
- "Track my order"
- "Show my pending orders"
- "Show delayed orders"

---

### Warehouse Incharge
**Warehouse-Specific Access**

✅ **Dashboard Access:**
- View warehouse-specific metrics
- See orders assigned to their warehouse
- Monitor warehouse inventory

✅ **Orders:**
- View orders assigned to their warehouse
- Track order status for warehouse orders
- View dispatch queue for their warehouse
- Cannot see orders from other warehouses

✅ **Inventory:**
- View inventory at their assigned warehouse only
- Check stock levels
- View low stock alerts for their warehouse
- Cannot access other warehouses' inventory

✅ **Chatbot:**
- Query orders for their warehouse
- Check inventory at their warehouse
- View dispatch queue
- View low stock alerts
- Cannot query other warehouses' data

✅ **Alerts:**
- View alerts related to their warehouse
- Low stock alerts
- Dispatch ready alerts
- Order-related alerts for their warehouse

**Chatbot Suggestions for Warehouse:**
- "Show dispatch queue"
- "Check inventory"
- "Show low stock alerts"

---

## 📋 Sample Test Orders

### For Distributors to Test:

**Pradeep (pradeep@srlchemicals.com):**
- SRL-3001 (In Preparation)
- SRL-3002 (Dispatch Ready)
- SRL-3003 (In Transit)

**Rohit (rohit@srlchemicals.com):**
- SRL-4001 (In Preparation)
- SRL-4002 (Awaiting Factory - Delayed)
- SRL-4003 (Dispatch Ready)

**SRL Distributor (distributor@srlchemicals.com):**
- SRL-1024 (In Preparation)
- SRL-2034 (Dispatch Ready)

---

## 🧪 Testing Scenarios

### Test Distributor Access Control:
1. Login as `pradeep@srlchemicals.com`
2. Try chatbot query: "Check inventory in Mumbai"
   - **Expected:** AI should decline and explain distributors cannot access inventory
3. Try chatbot query: "Show my orders"
   - **Expected:** Should show only Pradeep's orders (SRL-3001, SRL-3002, SRL-3003)

### Test Warehouse Access Control:
1. Login as `warehouse@srlchemicals.com` (Delhi Central)
2. Try chatbot query: "Check inventory"
   - **Expected:** Should show inventory for Delhi Central warehouse only
3. Try chatbot query: "Show orders"
   - **Expected:** Should show orders assigned to Delhi Central warehouse

### Test Super Admin Access:
1. Login as `super.admin@srlchemicals.com`
2. Try chatbot query: "Show all delayed orders"
   - **Expected:** Should show delayed orders from all companies
3. Try chatbot query: "Check inventory in Mumbai"
   - **Expected:** Should show inventory for Mumbai warehouses

---

## 🎯 Key Features to Test

### Chatbot Intelligence:
- ✅ Automatic warehouse name resolution (e.g., "Mumbai" → warehouse_id)
- ✅ Context maintenance across conversation
- ✅ Structured data rendering (tables, cards)
- ✅ Role-based query filtering

### Realtime Updates:
- ✅ Dashboard metrics update live
- ✅ Orders update without refresh
- ✅ Inventory updates in real-time
- ✅ Chat messages sync across sessions

### Security:
- ✅ Role-based route protection
- ✅ Data isolation per role
- ✅ Inventory access restricted to Admin/Warehouse only
- ✅ Distributors cannot see other companies' orders

---

## 📝 Notes

- All passwords are: `Srl@12345`
- The system uses Supabase for authentication and database
- Chatbot conversations are isolated per user session
- All data updates in real-time using Supabase Realtime subscriptions
- The AI chatbot respects role-based access control automatically

---

## 🆘 Troubleshooting

**Issue:** Cannot login
- **Solution:** Ensure you're using the correct email and password (`Srl@12345`)

**Issue:** Chatbot not responding
- **Solution:** Check browser console for errors, ensure OpenAI API key is configured

**Issue:** No data showing
- **Solution:** Run the seed script: `npm run seed:demo`

**Issue:** Inventory query denied for distributor
- **Solution:** This is expected behavior - distributors cannot access inventory

---

## 📞 Support

For issues or questions about the demo, please contact the development team.

---

**Last Updated:** 2026-03-06
**Version:** 1.0.0
