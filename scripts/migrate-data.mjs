import { PrismaClient } from "@prisma/client";
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const localPool = new pg.Pool({ connectionString: "postgresql://postgres:postgre123@localhost:5432/postgres" });
const localAdapter = new PrismaPg(localPool);
const localDb = new PrismaClient({ adapter: localAdapter });

const remotePool = new pg.Pool({ connectionString: "postgresql://postgres.hyjtguabepsmcxknzpwm:snehanshu9%40A@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres" });
const remoteAdapter = new PrismaPg(remotePool);
const remoteDb = new PrismaClient({ adapter: remoteAdapter });

async function migrateTable(modelName, localModel, remoteModel) {
  console.log(`Migrating ${modelName}...`);
  const data = await localModel.findMany();
  console.log(`Found ${data.length} records in local ${modelName}.`);
  if (data.length > 0) {
    // Delete existing data in remote table to avoid conflicts
    await remoteModel.deleteMany();
    // Insert all records
    await remoteModel.createMany({ data });
    console.log(`Successfully migrated ${modelName}.`);
  } else {
    console.log(`No records to migrate for ${modelName}.`);
  }
}

async function main() {
  try {
    console.log("Starting migration...");
    
    // Order matters due to foreign keys!
    // Delete in reverse order first (Prisma deleteMany will work)
    await remoteDb.inventoryMovement.deleteMany();
    await remoteDb.invoice.deleteMany();
    await remoteDb.orderItem.deleteMany();
    await remoteDb.order.deleteMany();
    await remoteDb.userRole.deleteMany();
    await remoteDb.aiProviderConfig.deleteMany();
    await remoteDb.product.deleteMany();
    await remoteDb.warehouse.deleteMany();
    await remoteDb.customer.deleteMany();
    
    // Independent tables
    await migrateTable("Customer", localDb.customer, remoteDb.customer);
    await migrateTable("Warehouse", localDb.warehouse, remoteDb.warehouse);
    await migrateTable("Product", localDb.product, remoteDb.product);
    await migrateTable("UserRole", localDb.userRole, remoteDb.userRole);
    await migrateTable("AiProviderConfig", localDb.aiProviderConfig, remoteDb.aiProviderConfig);
    
    // Tables with 1-level dependencies
    await migrateTable("Order", localDb.order, remoteDb.order);
    
    // Tables with 2-level dependencies
    await migrateTable("OrderItem", localDb.orderItem, remoteDb.orderItem);
    await migrateTable("Invoice", localDb.invoice, remoteDb.invoice);
    await migrateTable("InventoryMovement", localDb.inventoryMovement, remoteDb.inventoryMovement);
    
    console.log("Migration completed successfully!");
  } catch (error) {
    console.error("Error during migration:", error);
  } finally {
    await localDb.$disconnect();
    await remoteDb.$disconnect();
  }
}

main();
