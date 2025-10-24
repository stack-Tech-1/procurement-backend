import prisma from '../config/prismaClient.js';

const VENDOR_PREFIX = 'KRE-V-';
const ID_LENGTH = 4; // e.g., 0001

// Helper to pad the number
const padNumber = (num) => String(num).padStart(ID_LENGTH, '0');

export async function generateNewVendorId() {
    // 1. Find the last vendor record that has a vendorId
    const lastVendor = await prisma.vendor.findFirst({
        where: { vendorId: { not: null } },
        orderBy: { vendorId: 'desc' },
        select: { vendorId: true },
    });

    let nextNumber = 1;

    if (lastVendor?.vendorId) {
        // 2. Extract the numeric part (e.g., '0001' from 'KRE-V-0001')
        const numericPart = lastVendor.vendorId.split('-').pop(); 
        const currentNumber = parseInt(numericPart, 10);
        
        // 3. Increment the number
        if (!isNaN(currentNumber)) {
            nextNumber = currentNumber + 1;
        }
    }

    // 4. Return the new full formatted ID (e.g., 'KRE-V-0002')
    return `${VENDOR_PREFIX}${padNumber(nextNumber)}`;
}