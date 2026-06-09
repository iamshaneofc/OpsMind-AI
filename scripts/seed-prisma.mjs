import { PrismaClient } from "@prisma/client";
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const pool = new pg.Pool({ connectionString: "postgresql://postgres.hyjtguabepsmcxknzpwm:snehanshu9%40A@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres" });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function seed() {
  console.log("Seeding database with Prisma...");

  // Clean existing data
  await prisma.inventoryMovement.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.userRole.deleteMany();

  // Create Warehouses
  const w1 = await prisma.warehouse.create({
    data: { name: "Central Hub", location: "New York", capacity: 5000 }
  });
  const w2 = await prisma.warehouse.create({
    data: { name: "West Coast Depot", location: "Los Angeles", capacity: 3000 }
  });

  // Create Customers
  const c1 = await prisma.customer.create({
    data: { name: "Acme Corp", email: "contact@acme.com", phone: "555-0100", address: "123 Business Rd", status: "ACTIVE" }
  });
  const c2 = await prisma.customer.create({
    data: { name: "Globex", email: "info@globex.com", phone: "555-0200", address: "456 Enterprise Way", status: "ACTIVE" }
  });

  // Create Products
  const p1 = await prisma.product.create({
    data: { sku: "PRD-001", name: "Industrial Widget", category: "Hardware", price: 150.0, cost: 90.0, description: "Heavy duty widget" }
  });
  const p2 = await prisma.product.create({
    data: { sku: "PRD-002", name: "Copper Coil", category: "Materials", price: 75.0, cost: 40.0, description: "Premium copper coil" }
  });

  // Create Inventory
  await prisma.inventoryMovement.create({
    data: { productId: p1.id, warehouseId: w1.id, quantity: 500, type: "RESTOCK" }
  });
  await prisma.inventoryMovement.create({
    data: { productId: p2.id, warehouseId: w1.id, quantity: 300, type: "RESTOCK" }
  });

  // Create Orders
  const o1 = await prisma.order.create({
    data: {
      orderNumber: "ORD-1001",
      customerId: c1.id,
      warehouseId: w1.id,
      status: "PROCESSING",
      totalAmount: 1500.0,
      expectedDelivery: new Date(Date.now() + 5 * 86400000)
    }
  });

  await prisma.orderItem.create({
    data: {
      orderId: o1.id,
      productId: p1.id,
      quantity: 10,
      unitPrice: 150.0,
      totalPrice: 1500.0
    }
  });

  const o2 = await prisma.order.create({
    data: {
      orderNumber: "ORD-1002",
      customerId: c2.id,
      warehouseId: w2.id,
      status: "DELIVERED",
      totalAmount: 750.0,
      expectedDelivery: new Date(Date.now() - 1 * 86400000)
    }
  });

  await prisma.orderItem.create({
    data: {
      orderId: o2.id,
      productId: p2.id,
      quantity: 10,
      unitPrice: 75.0,
      totalPrice: 750.0
    }
  });

  // Create UserRoles
  await prisma.userRole.create({
    data: { email: "admin@opsmind.com", role: "ADMIN" }
  });

  console.log("Database seeded successfully!");
}

seed()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
