// Create Prisma-managed tables directly via SQL
// These are separate from the Supabase SQL tables

import { readFileSync } from "node:fs";
import { Client } from "pg";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();

const DATABASE_URL = requireEnv("DATABASE_URL");

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL.replace("?pgbouncer=true", "").replace("&pgbouncer=true", ""),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const sql = `
    -- Prisma-managed tables for dashboard data

    -- UserRole table
    CREATE TABLE IF NOT EXISTS public."UserRole" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      email TEXT UNIQUE NOT NULL,
      role TEXT DEFAULT 'MANAGER',
      "createdAt" TIMESTAMPTZ DEFAULT now(),
      "updatedAt" TIMESTAMPTZ DEFAULT now()
    );

    -- Customer table
    CREATE TABLE IF NOT EXISTS public."Customer" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      location TEXT,
      status TEXT DEFAULT 'ACTIVE',
      "createdAt" TIMESTAMPTZ DEFAULT now(),
      "updatedAt" TIMESTAMPTZ DEFAULT now()
    );

    -- Product table
    CREATE TABLE IF NOT EXISTS public."Product" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      sku TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      price DOUBLE PRECISION,
      cost DOUBLE PRECISION,
      description TEXT,
      "createdAt" TIMESTAMPTZ DEFAULT now(),
      "updatedAt" TIMESTAMPTZ DEFAULT now()
    );

    -- Warehouse table
    CREATE TABLE IF NOT EXISTS public."Warehouse" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      capacity INTEGER,
      "createdAt" TIMESTAMPTZ DEFAULT now(),
      "updatedAt" TIMESTAMPTZ DEFAULT now()
    );

    -- Order table
    CREATE TABLE IF NOT EXISTS public."Order" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "orderNumber" TEXT UNIQUE NOT NULL,
      "customerId" TEXT NOT NULL REFERENCES public."Customer"(id),
      "warehouseId" TEXT NOT NULL REFERENCES public."Warehouse"(id),
      status TEXT NOT NULL,
      "totalAmount" DOUBLE PRECISION NOT NULL,
      "orderDate" TIMESTAMPTZ DEFAULT now(),
      "expectedDelivery" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ DEFAULT now(),
      "updatedAt" TIMESTAMPTZ DEFAULT now()
    );

    -- OrderItem table
    CREATE TABLE IF NOT EXISTS public."OrderItem" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "orderId" TEXT NOT NULL REFERENCES public."Order"(id) ON DELETE CASCADE,
      "productId" TEXT NOT NULL REFERENCES public."Product"(id),
      quantity INTEGER NOT NULL,
      "unitPrice" DOUBLE PRECISION NOT NULL,
      "totalPrice" DOUBLE PRECISION NOT NULL,
      "createdAt" TIMESTAMPTZ DEFAULT now()
    );

    -- Invoice table
    CREATE TABLE IF NOT EXISTS public."Invoice" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "invoiceNumber" TEXT UNIQUE NOT NULL,
      "orderId" TEXT NOT NULL REFERENCES public."Order"(id),
      amount DOUBLE PRECISION NOT NULL,
      status TEXT NOT NULL,
      "dueDate" TIMESTAMPTZ NOT NULL,
      "createdAt" TIMESTAMPTZ DEFAULT now(),
      "updatedAt" TIMESTAMPTZ DEFAULT now()
    );

    -- InventoryMovement table
    CREATE TABLE IF NOT EXISTS public."InventoryMovement" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "productId" TEXT NOT NULL REFERENCES public."Product"(id),
      "warehouseId" TEXT NOT NULL REFERENCES public."Warehouse"(id),
      quantity INTEGER NOT NULL,
      type TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ DEFAULT now()
    );

    -- AiProviderConfig table
    CREATE TABLE IF NOT EXISTS public."AiProviderConfig" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      provider TEXT UNIQUE NOT NULL,
      "apiKey" TEXT NOT NULL,
      "isActive" BOOLEAN DEFAULT false,
      "createdAt" TIMESTAMPTZ DEFAULT now(),
      "updatedAt" TIMESTAMPTZ DEFAULT now()
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_order_customer ON public."Order"("customerId");
    CREATE INDEX IF NOT EXISTS idx_order_warehouse ON public."Order"("warehouseId");
    CREATE INDEX IF NOT EXISTS idx_order_status ON public."Order"(status);
    CREATE INDEX IF NOT EXISTS idx_orderitem_order ON public."OrderItem"("orderId");
    CREATE INDEX IF NOT EXISTS idx_orderitem_product ON public."OrderItem"("productId");
    CREATE INDEX IF NOT EXISTS idx_invoice_order ON public."Invoice"("orderId");
    CREATE INDEX IF NOT EXISTS idx_inventory_product ON public."InventoryMovement"("productId");
    CREATE INDEX IF NOT EXISTS idx_inventory_warehouse ON public."InventoryMovement"("warehouseId");
  `;

  console.log("Creating Prisma-managed tables...");
  await client.query(sql);
  console.log("Prisma tables created successfully.");

  await client.end();
}

main().catch((err) => {
  console.error("Failed:", err.message || err);
  process.exit(1);
});
