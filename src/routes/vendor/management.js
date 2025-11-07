import express from 'express';
import prisma from '../../config/prismaClient.js';
import { authenticateToken } from '../../middleware/authMiddleware.js'; // Assuming you have this
import { generateNewVendorId } from '../../utils/vendorIdGenerator.js';
import { logAudit } from '../../utils/auditLogger.js';
import { sendVendorNotification } from '../../utils/emailService.js'; 

const router = express.Router();



// Middleware to check if the user is a Procurement Reviewer/Manager (Role IDs 1 or 2)
const authorizeProcurement = (req, res, next) => {
    // Role IDs: 1 (Admin), 2 (Procurement)
    if (req.user?.roleId === 1 || req.user?.roleId === 2) { 
        next();
    } else {
        return res.status(403).json({ error: 'Access denied. Requires Procurement/Admin role.' });
    }
};


// Helper to extract specific document data
const extractDocumentDate = (documents, docType) => {
    const doc = documents.find(d => d.docType === docType);
    return doc?.expiryDate || null;
};


/**
 * GET /api/vendor/list
 * Fetches list of all vendors with filtering, searching, and sorting.
 */
router.get('/list', authenticateToken, authorizeProcurement, async (req, res) => {
    const { 
        search, 
        status, 
        type, 
        category, // New category filter
        sortField = 'updatedAt', 
        sortOrder = 'desc', 
        page = 1, 
        pageSize = 10,
        expiryStatus // e.g., 'EXPIRED', 'EXPIRING_30D'
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const take = parseInt(pageSize);
    
    // 1. Build the WHERE clause for filtering and searching
    const where = {};

    // Filter by Status, Type, and Category
    if (status) where.status = status;
    if (type) where.vendorType = type;
    
    // ✅ NEW: Filter by Category using the VendorToCategory link table
    if (category) {
        where.categories = {
            some: {
                category: {
                    name: category
                }
            }
        };
    }

    // Full-Text Search on name, CR, and email
    if (search) {
        where.OR = [
            // Using the correct field: companyLegalName
            { companyLegalName: { contains: search, mode: 'insensitive' } },
            { crNumber: { contains: search, mode: 'insensitive' } },
            { contactEmail: { contains: search, mode: 'insensitive' } },
        ];
    }
    
    // 2. Build the ORDER BY clause for sorting
    const orderBy = {};
    orderBy[sortField] = sortOrder; 

    try {
        // 3. Fetch data
        const [vendors, totalCount] = await prisma.$transaction([
            prisma.vendor.findMany({
                where: where,
                orderBy: orderBy,
                skip: skip,
                take: take,
                select: {
                    id: true,
                    vendorId: true,
                    companyLegalName: true,
                    vendorType: true,
                    status: true,
                    vendorClass: true,           // ✅ NEW: Include vendor classification
                    qualificationScore: true,    // ✅ UPDATED: Renamed from 'score'
                    contactEmail: true,
                    addressCountry: true,
                    updatedAt: true,
                    // ✅ NEW: Eagerly load assigned and last reviewer names
                    assignedReviewer: { select: { name: true } }, 
                    lastReviewedBy: { select: { name: true } },
                    // 4. Eagerly load all documents to extract expiry dates efficiently
                    documents: {
                        where: {
                            docType: { in: ['COMMERCIAL_REGISTRATION', 'ISO_CERTIFICATE', 'ZAKAT_CERTIFICATE'] }
                        },
                        select: {
                            docType: true,
                            expiryDate: true,
                        }
                    }
                },
            }),
            prisma.vendor.count({ where: where }),
        ]);

        // 5. Post-process to extract expiry dates and format reviewer names
        const processedVendors = vendors.map(vendor => {
            const crExpiry = extractDocumentDate(vendor.documents, 'COMMERCIAL_REGISTRATION');
            const isoExpiry = extractDocumentDate(vendor.documents, 'ISO_CERTIFICATE');
            const zakatExpiry = extractDocumentDate(vendor.documents, 'ZAKAT_CERTIFICATE');
            
            // Remove the raw documents/relation objects and flatten the reviewer names
            const { documents, assignedReviewer, lastReviewedBy, ...rest } = vendor;

            return {
                ...rest,
                name: vendor.companyLegalName,
                crExpiry,
                isoExpiry,
                zakatExpiry,
                assignedReviewerName: assignedReviewer?.name || null, // ✅ NEW
                lastReviewedByName: lastReviewedBy?.name || null,     // ✅ NEW
            };
        });

        res.status(200).json({
            data: processedVendors,
            total: totalCount,
            page: parseInt(page),
            pageSize: parseInt(pageSize),
            totalPages: Math.ceil(totalCount / parseInt(pageSize)),
        });

    } catch (error) {
        console.error('❌ Vendor List Fetch Error:', error);
        res.status(500).json({ error: 'Failed to fetch vendor list.' });
    }
});




/**
 * POST /api/vendor/status/:id
 * Updates the status and qualification/review fields of a vendor.
 */
router.post('/status/:vendorId', authenticateToken, authorizeProcurement, async (req, res) => {
    const { vendorId } = req.params;
    const { 
        newStatus, 
        reviewNotes,
        vendorClass,         // NEW: Classification (A, B, C, D)
        qualificationScore,  // NEW: Score (0-100)
        assignedReviewerId,  // NEW: ID of the next person to review
        nextReviewDate,      // NEW: Date for next review
    } = req.body; 
    
    const currentUserId = req.user.id; 

    // 1. Validation (Expanded to allow RENEWAL)
    if (!['APPROVED', 'REJECTED', 'UNDER_REVIEW', 'BLACKLISTED', 'NEEDS_RENEWAL'].includes(newStatus)) {
        return res.status(400).json({ error: 'Invalid vendor status provided.' });
    }

    try {
        const vendor = await prisma.vendor.findUnique({ 
            where: { id: parseInt(vendorId) },
            select: { 
                id: true, 
                status: true, 
                vendorId: true, 
                companyLegalName: true, 
                contactEmail: true,
                // Include existing qualification fields for audit log comparison
                vendorClass: true,
                qualificationScore: true,
                assignedReviewerId: true,
            } 
        });

        if (!vendor) {
            return res.status(404).json({ error: 'Vendor not found.' });
        }
        
        const oldStatus = vendor.status;
        let finalVendorId = vendor.vendorId;

        // Prepare the update data payload
        const updateData = {
            status: newStatus,
            reviewNotes: reviewNotes || null,
            updatedAt: new Date(),
            
            // Set qualification fields if provided (using undefined skips the update if null is not desired)
            vendorClass: vendorClass || undefined,
            // Convert score to Float if present, otherwise undefined
            qualificationScore: qualificationScore !== undefined ? parseFloat(qualificationScore) : undefined, 
            
            // Set reviewer fields
            assignedReviewerId: assignedReviewerId ? parseInt(assignedReviewerId) : null,
            lastReviewedById: currentUserId, // The person executing this action
            nextReviewDate: nextReviewDate ? new Date(nextReviewDate) : null,
            
            // Set the qualification flag based on the new status
            isQualified: newStatus === 'APPROVED' ? true : newStatus === 'REJECTED' ? false : undefined,
        };

        // 2. Transaction for Status Update and ID Assignment
        const updatedVendor = await prisma.$transaction(async (tx) => {
            
            // Check if approval requires ID assignment
            if (newStatus === 'APPROVED' && !vendor.vendorId) {
                finalVendorId = await generateNewVendorId();
                updateData.vendorId = finalVendorId;
            }

            // Update the Vendor record
            return await tx.vendor.update({
                where: { id: vendor.id },
                data: updateData,
            });
        });

        // 3. Post-Transaction Actions (Audit Log and Notification)
        
        // Log the change (Enhanced to include new fields)
        await logAudit(
            currentUserId, 
            `VENDOR_QUALIFICATION_UPDATE`, 
            'Vendor', 
            vendor.id, 
            { 
                oldStatus: oldStatus, 
                newStatus: newStatus, 
                vendorIdAssigned: finalVendorId,
                reviewNotes: reviewNotes,
                oldVendorClass: vendor.vendorClass,
                newVendorClass: updatedVendor.vendorClass,
                oldScore: vendor.qualificationScore,
                newScore: updatedVendor.qualificationScore,
                assignedReviewerId: updatedVendor.assignedReviewerId,
                lastReviewedById: currentUserId
            }
        );

        // Send Email Notification (Logic remains the same)
        let subject, body;
        if (newStatus === 'APPROVED') {
            subject = 'Vendor Qualification Approved - Welcome!';
            body = `Congratulations, your vendor qualification has been approved! Your assigned Vendor ID is: ${finalVendorId}. You are now eligible for RFQs.`;
        } else if (newStatus === 'REJECTED') {
            subject = 'Vendor Qualification Rejected';
            body = `Your vendor qualification was rejected. Reason: ${reviewNotes || 'Please check the rejection details on your portal.'}`;
        } else {
             subject = `Vendor Status Updated to ${newStatus}`;
             body = `Your vendor profile status has been updated to ${newStatus}. ${reviewNotes ? `Notes: ${reviewNotes}` : ''}`;
        }

        if (vendor.contactEmail) {
              await sendVendorNotification(vendor.contactEmail, subject, body);
        }

        return res.status(200).json({ 
            message: `Vendor ${vendor.companyLegalName} status and qualification updated to ${newStatus}.`,
            vendor: updatedVendor,
        });

    } catch (error) {
        console.error(`❌ Vendor Status Update Error for ID ${vendorId}:`, error);
        return res.status(500).json({ error: 'Failed to update vendor status.' });
    }
});





/**
 * GET /api/vendor/analytics/summary
 * Returns key performance indicators (KPIs) for the dashboard.
 */
router.get('/analytics/summary', authenticateToken, authorizeProcurement, async (req, res) => {
    try {
        // 1. Total Vendors and Status Breakdown
        const totalCount = await prisma.vendor.count();
        const statusCounts = await prisma.vendor.groupBy({
            by: ['status'],
            _count: {
                id: true,
            },
        });

        // Format status counts into a key-value object
        const statusSummary = statusCounts.reduce((acc, curr) => {
            acc[curr.status] = curr._count.id;
            return acc;
        }, { 
            NEW: 0, 
            UNDER_REVIEW: 0, 
            APPROVED: 0, 
            REJECTED: 0, 
            NEEDS_RENEWAL: 0 
        });

        // ----------------------------------------------------
        // 3. ADD VENDOR TYPE BREAKDOWN (NEW CODE ADDED HERE)
        // ----------------------------------------------------
        const typeCounts = await prisma.vendor.groupBy({
            by: ['vendorType'],
            _count: {
                id: true,
            },
            // Filter out any vendors that might be missing a type, if desired.
            // where: { vendorType: { not: null } }
        });

        // Format type counts into a simple key-value object
        const vendorTypeBreakdown = typeCounts.reduce((acc, curr) => {
            // Note: curr.vendorType might be null if your schema allows it. We'll handle 'null' as 'Unknown'.
            const typeKey = curr.vendorType || 'Unknown'; 
            acc[typeKey] = curr._count.id;
            return acc;
        }, {});
        // ----------------------------------------------------


        // 2. Count of vendors with Expired/Expiring Documents (Existing logic remains)
        const today = new Date();
        const thirtyDaysFromNow = new Date(today);
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        
        // ... (Existing logic for expiredVendors and expiringVendors remains) ...
        const expiredVendors = await prisma.vendorDocument.findMany({
            where: {
                docType: { in: ['COMMERCIAL_REGISTRATION', 'ISO_CERTIFICATE', 'ZAKAT_CERTIFICATE', 'GOSI_CERTIFICATE'] },
                expiryDate: { lt: today }
            },
            distinct: ['vendorId'],
            select: { vendorId: true }
        });
        const expiredVendorsCount = expiredVendors.length;
        
        const expiringVendors = await prisma.vendorDocument.findMany({
            where: {
                docType: { in: ['COMMERCIAL_REGISTRATION', 'ISO_CERTIFICATE', 'ZAKAT_CERTIFICATE', 'GOSI_CERTIFICATE'] },
                expiryDate: { gte: today, lte: thirtyDaysFromNow } 
            },
            distinct: ['vendorId'],
            select: { vendorId: true }
        });
        const expiringVendorsCount = expiringVendors.length;

        // 4. Return the complete summary, including the NEW data
        res.status(200).json({
            totalVendors: totalCount,
            statusBreakdown: statusSummary,
            vendorTypeBreakdown: vendorTypeBreakdown, // <--- THE NEW KEY!
            expiredVendorsCount: expiredVendorsCount,
            expiringSoonVendorsCount: expiringVendorsCount,
        });

    } catch (error) {
        console.error('❌ Vendor Analytics Fetch Error:', error);
        res.status(500).json({ error: 'Failed to fetch vendor analytics.' });
    }
});









export default router;