// prisma/seed.js
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1️⃣ Seed roles with fixed IDs
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

  // 2️⃣ ✅ UPDATED: Seed CSI Categories (matches your new schema)
  const csiCategories = [
    { name: 'Procurement & Contracting', csiCode: '00' },
    { name: 'General Requirements', csiCode: '01' },
    { name: 'Existing Conditions', csiCode: '02' },
    { name: 'Concrete', csiCode: '03' },
    { name: 'Masonry', csiCode: '04' },
    { name: 'Metals', csiCode: '05' },
    { name: 'Wood, Plastics & Composites', csiCode: '06' },
    { name: 'Thermal & Moisture Protection', csiCode: '07' },
    { name: 'Openings', csiCode: '08' },
    { name: 'Finishes', csiCode: '09' },
    { name: 'Specialties', csiCode: '10' },
    { name: 'Equipment', csiCode: '11' },
    { name: 'Furnishings', csiCode: '12' },
    { name: 'Special Construction', csiCode: '13' },
    { name: 'Conveying Equipment', csiCode: '14' },
    { name: 'Fire Suppression', csiCode: '21' },
    { name: 'Plumbing', csiCode: '22' },
    { name: 'HVAC', csiCode: '23' },
    { name: 'Integrated Automation', csiCode: '25' },
    { name: 'Electrical', csiCode: '26' },
    { name: 'Communications', csiCode: '27' },
    { name: 'Electronic Safety & Security', csiCode: '28' },
    { name: 'Earthwork', csiCode: '31' },
    { name: 'Exterior Improvements', csiCode: '32' },
    { name: 'Utilities', csiCode: '33' },
  ];

  for (const category of csiCategories) {
    await prisma.category.upsert({
      where: { csiCode: category.csiCode },
      update: {},
      create: category,
    });
  }

  console.log('✅ CSI Categories seeded:', csiCategories.length);

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