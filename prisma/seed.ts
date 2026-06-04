import { prisma } from '../src/lib/db';
import { faker } from '@faker-js/faker';

async function main() {
  console.log('Starting seed...');

  // Create Warehouses (5)
  console.log('Seeding warehouses...');
  const warehouseData = Array.from({ length: 5 }).map(() => ({
    name: faker.company.name() + ' Warehouse',
    location: faker.location.city(),
    capacity: faker.number.int({ min: 10000, max: 100000 }),
  }));
  const warehouses = await Promise.all(
    warehouseData.map((data) => prisma.warehouse.create({ data }))
  );

  // Create Customers (100)
  console.log('Seeding customers...');
  const customerData = Array.from({ length: 100 }).map(() => ({
    name: faker.company.name(),
    email: faker.internet.email(),
    phone: faker.phone.number(),
    address: faker.location.streetAddress(),
    status: faker.helpers.arrayElement(['ACTIVE', 'ACTIVE', 'ACTIVE', 'INACTIVE']),
  }));
  const customers = await Promise.all(
    customerData.map((data) => prisma.customer.create({ data }))
  );

  // Create Products (50)
  console.log('Seeding products...');
  const productData = Array.from({ length: 50 }).map(() => ({
    sku: faker.string.alphanumeric({ length: 8, casing: 'upper' }),
    name: faker.commerce.productName(),
    category: faker.commerce.department(),
    price: parseFloat(faker.commerce.price({ min: 10, max: 1000, dec: 2 })),
    cost: parseFloat(faker.commerce.price({ min: 5, max: 500, dec: 2 })),
    description: faker.commerce.productDescription(),
  }));
  const products = await Promise.all(
    productData.map((data) => prisma.product.create({ data }))
  );

  // Create Orders and OrderItems (1000 orders, ~5 items each)
  console.log('Seeding orders and order items...');
  const orders = [];
  // Insert in batches of 100 to avoid memory issues
  for (let i = 0; i < 10; i++) {
    const batchOrders = Array.from({ length: 100 }).map(() => {
      const customer = faker.helpers.arrayElement(customers);
      const warehouse = faker.helpers.arrayElement(warehouses);
      const numItems = faker.number.int({ min: 1, max: 10 });
      let totalAmount = 0;
      
      const items = Array.from({ length: numItems }).map(() => {
        const product = faker.helpers.arrayElement(products);
        const quantity = faker.number.int({ min: 1, max: 50 });
        const unitPrice = product.price;
        const totalPrice = quantity * unitPrice;
        totalAmount += totalPrice;
        return {
          productId: product.id,
          quantity,
          unitPrice,
          totalPrice,
        };
      });

      return {
        orderNumber: 'ORD-' + faker.string.alphanumeric({ length: 8, casing: 'upper' }),
        customerId: customer.id,
        warehouseId: warehouse.id,
        status: faker.helpers.arrayElement(['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'DELIVERED', 'DELAYED', 'CANCELLED']),
        totalAmount,
        orderDate: faker.date.recent({ days: 365 }),
        expectedDelivery: faker.date.soon({ days: 14 }),
        items: {
          create: items,
        },
      };
    });

    for (const order of batchOrders) {
      const createdOrder = await prisma.order.create({
        data: order,
      });
      orders.push(createdOrder);
    }
    console.log(`Seeded order batch ${i + 1}/10`);
  }

  // Create Invoices (200)
  console.log('Seeding invoices...');
  const invoiceData = Array.from({ length: 200 }).map(() => {
    const order = faker.helpers.arrayElement(orders);
    const isPaid = faker.datatype.boolean();
    return {
      invoiceNumber: 'INV-' + faker.string.alphanumeric({ length: 8, casing: 'upper' }),
      orderId: order.id,
      amount: order.totalAmount,
      status: isPaid ? 'PAID' : faker.helpers.arrayElement(['UNPAID', 'OVERDUE']),
      dueDate: faker.date.soon({ days: 30 }),
    };
  });
  
  await Promise.all(
    invoiceData.map(async (data) => {
      // prevent unique constraint error on orderId if we selected the same order twice
      // by just using a try-catch for simplicity, since it's a seed
      try {
        await prisma.invoice.create({ data });
      } catch (e) {
        // ignore duplicate invoice for order
      }
    })
  );

  // Create Inventory Movements
  console.log('Seeding inventory movements...');
  const movementData = Array.from({ length: 500 }).map(() => {
    const product = faker.helpers.arrayElement(products);
    const warehouse = faker.helpers.arrayElement(warehouses);
    const type = faker.helpers.arrayElement(['RESTOCK', 'SALE', 'ADJUSTMENT']);
    const quantity = type === 'SALE' ? -faker.number.int({ min: 1, max: 100 }) : faker.number.int({ min: 10, max: 500 });
    
    return {
      productId: product.id,
      warehouseId: warehouse.id,
      quantity,
      type,
    };
  });
  
  await Promise.all(
    movementData.map((data) => prisma.inventoryMovement.create({ data }))
  );

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
