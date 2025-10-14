// prisma/seed.js
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1️⃣ Ensure roles exist (upsert = create if not exist)
  const roles = ['Admin', 'Procurement', 'Vendor'];
  for (const roleName of roles) {
    await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });
  }

  console.log('✅ Roles seeded:', roles);



    // 3️⃣ Seed default categories
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
  




  // 2️⃣ Create a default admin user if it doesn't exist
  const adminEmail = 'admin@example.com';
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash('Admin@123', 10);

    // Find the Admin role id
    const adminRole = await prisma.role.findUnique({
      where: { name: 'Admin' },
    });

    await prisma.user.create({
      data: {
        name: 'System Admin',
        email: adminEmail,
        password: hashedPassword,
        roleId: adminRole.id,
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
