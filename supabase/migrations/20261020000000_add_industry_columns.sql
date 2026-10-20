-- Add industry column and indexes to all main tables (from prisma/schema.prisma update)

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "industry" TEXT NOT NULL DEFAULT 'chemical';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "industry" TEXT NOT NULL DEFAULT 'chemical';
ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "industry" TEXT NOT NULL DEFAULT 'chemical';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "industry" TEXT NOT NULL DEFAULT 'chemical';
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "industry" TEXT NOT NULL DEFAULT 'chemical';
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "industry" TEXT NOT NULL DEFAULT 'chemical';

CREATE INDEX IF NOT EXISTS "Customer_industry_idx" ON "Customer"("industry");
CREATE INDEX IF NOT EXISTS "Product_industry_idx" ON "Product"("industry");
CREATE INDEX IF NOT EXISTS "Warehouse_industry_idx" ON "Warehouse"("industry");
CREATE INDEX IF NOT EXISTS "Order_industry_idx" ON "Order"("industry");
CREATE INDEX IF NOT EXISTS "Order_status_idx" ON "Order"("status");
CREATE INDEX IF NOT EXISTS "Order_warehouseId_idx" ON "Order"("warehouseId");
CREATE INDEX IF NOT EXISTS "Invoice_industry_idx" ON "Invoice"("industry");
CREATE INDEX IF NOT EXISTS "Invoice_status_idx" ON "Invoice"("status");
CREATE INDEX IF NOT EXISTS "InventoryMovement_industry_idx" ON "InventoryMovement"("industry");
CREATE INDEX IF NOT EXISTS "InventoryMovement_productId_warehouseId_idx" ON "InventoryMovement"("productId", "warehouseId");
