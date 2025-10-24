// prisma/seed.js
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1️⃣ Seed roles with fixed IDs (so roleId = 3 works in register)
  const roles = [
    { id: 1, name: 'Admin' },
    { id: 2, name: 'Procurement' },
    { id: 3, name: 'Vendor' },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { id: role.id },
      update: {},
      create: role,
    });
  }

  console.log('✅ Roles seeded:', roles.map(r => `${r.id} → ${r.name}`));

  // 2️⃣ Seed default vendor categories
  const vendorCategories = [
    { name: 'Electrical' },
    { name: 'Mechanical' },
    { name: 'Civil' },
  ];

  for (const cat of vendorCategories) {
    await prisma.vendorCategory.upsert({
      where: { name: cat.name },
      update: {},
      create: cat,
    });
  }

  console.log('✅ Vendor Categories seeded:', vendorCategories.map(c => c.name));

  // 3️⃣ Create a default admin user if it doesn't exist
  const adminEmail = 'admin@example.com';
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash('Admin@123', 10);

    await prisma.user.create({
      data: {
        name: 'System Admin',
        email: adminEmail,
        password: hashedPassword,
        roleId: 1, // ✅ Admin roleId fixed to 1
      },
    });

    console.log('👤 Admin user created successfully!');
    console.log(`➡️  Email: ${adminEmail}`);
    console.log(`➡️  Password: Admin@123`);
  } else {
    console.log('ℹ️  Admin user already exists, skipping creation.');
  }

  console.log('🌳 Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
