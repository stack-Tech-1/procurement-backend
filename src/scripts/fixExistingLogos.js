// backend/src/scripts/fixExistingLogos.js
import { PrismaClient } from '@prisma/client';
import { generatePresignedUrl } from '../lib/awsS3.js';

const prisma = new PrismaClient();

async function fixExistingLogos() {
    try {
        console.log('🔍 Finding vendors with logos...');
        
        const vendors = await prisma.vendor.findMany({
            where: { logo: { not: null } },
            select: { id: true, logo: true }
        });

        console.log(`Found ${vendors.length} vendors with logos`);
        
        for (const vendor of vendors) {
            console.log(`\nProcessing vendor ${vendor.id}:`);
            console.log(`Current logo value: ${vendor.logo}`);
            
            let newLogoValue = vendor.logo;
            
            // If it's a public S3 URL without signature
            if (vendor.logo.includes('s3.amazonaws.com') && !vendor.logo.includes('X-Amz-Signature=')) {
                console.log('⚠️ Found public S3 URL, extracting key...');
                
                try {
                    // Extract S3 key from URL
                    const urlParts = vendor.logo.split('.amazonaws.com/');
                    if (urlParts.length > 1) {
                        const s3Key = decodeURIComponent(urlParts[1].split('?')[0]);
                        console.log(`Extracted S3 key: ${s3Key}`);
                        
                        // Store just the S3 key
                        newLogoValue = s3Key;
                        
                        console.log(`✅ Will store S3 key instead of URL`);
                    }
                } catch (error) {
                    console.log(`❌ Failed to extract S3 key: ${error.message}`);
                    newLogoValue = null;
                }
            }
            
            // If we changed the value, update the database
            if (newLogoValue !== vendor.logo) {
                await prisma.vendor.update({
                    where: { id: vendor.id },
                    data: { logo: newLogoValue }
                });
                console.log(`✅ Updated vendor ${vendor.id}`);
            } else {
                console.log(`✅ No change needed`);
            }
        }
        
        console.log('\n🎯 Logo fix completed!');
        
    } catch (error) {
        console.error('Error fixing logos:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Run the fix
fixExistingLogos();