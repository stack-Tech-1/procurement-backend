import prisma from '../config/prismaClient.js';

async function initializeDefaultRoles() {
    console.log('🔄 Initializing default roles...');
  
    const defaultRoles = [
      { name: 'ADMIN', desc: 'System Administrator' },
      { name: 'PROCUREMENT_MANAGER', desc: 'Procurement Department Manager' },
      { name: 'PROCUREMENT_ENGINEER', desc: 'Procurement Engineer/Officer' },
      { name: 'COST_MANAGER', desc: 'Cost Control Manager' },
      { name: 'PROJECT_MANAGER', desc: 'Project Manager' },
      { name: 'DIRECTOR', desc: 'Company Director' },
      { name: 'VENDOR_USER', desc: 'Vendor User' },
      { name: 'LEGAL_REVIEWER', desc: 'Legal Department Reviewer' }
    ];
  
    let createdCount = 0;
    let skippedCount = 0;
  
    try {
      for (const roleData of defaultRoles) {
        // Check if role exists by name (not ID)
        const existing = await prisma.role.findFirst({
          where: { name: roleData.name }
        });
  
        if (!existing) {
          try {
            await prisma.role.create({
              data: roleData
            });
            createdCount++;
            console.log(`✅ Created role: ${roleData.name}`);
          } catch (createError) {
            if (createError.code === 'P2002') {
              // Unique constraint violation - role might exist with different case
              console.log(`⏭️ Role already exists (different case?): ${roleData.name}`);
              skippedCount++;
            } else {
              console.error(`❌ Error creating role ${roleData.name}:`, createError.message);
            }
          }
        } else {
          skippedCount++;
          console.log(`✅ Role already exists: ${roleData.name}`);
        }
      }
  
      console.log(`🎉 Role initialization completed: ${createdCount} created, ${skippedCount} already existed`);
      return { created: createdCount, skipped: skippedCount };
      
    } catch (error) {
      console.error('❌ Role initialization failed:', error);
      throw error;
    }
  }
  
  // Run if called directly
  if (import.meta.url === `file://${process.argv[1]}`) {
    initializeDefaultRoles()
      .then(() => {
        console.log('Role initialization completed');
        process.exit(0);
      })
      .catch(error => {
        console.error('Role initialization failed:', error);
        process.exit(1);
      });
  }
  
  export { initializeDefaultRoles };