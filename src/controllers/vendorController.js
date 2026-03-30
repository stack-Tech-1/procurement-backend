import prisma from "../config/prismaClient.js";
import { generatePresignedUrl, getPublicUrl, uploadToS3 } from '../lib/awsS3.js';
import path from 'path';
import { emailService } from '../services/emailService.js';
import { logAudit } from '../utils/auditLogger.js';
import { notificationService } from '../services/notificationService.js';

/**
 * Get vendor details for Admin/Procurement view
 * GET /api/vendors/:id
 */
export const getVendorDetails = async (req, res) => {
    const { id } = req.params;
    
    // FIX: Add validation for the ID parameter
    if (!id) {
        return res.status(400).json({ error: 'Vendor ID is required' });
    }
    
    // FIX: Ensure ID is a valid number
    const vendorId = parseInt(id);
    if (isNaN(vendorId)) {
        return res.status(400).json({ error: 'Invalid vendor ID' });
    }
    
    console.log('🔍 Fetching vendor details for ID:', vendorId);
    
    try {
        const vendor = await prisma.vendor.findUnique({
            where: { id: vendorId },
            include: {
                documents: true, 
                projectExperience: true, 
                categories: {
                    include: {
                        category: {
                            select: {
                                id: true,
                                name: true,
                                csiCode: true,
                                description: true,
                            }
                        }
                    }
                },
                assignedReviewer: { select: { id: true, name: true, email: true } },
                lastReviewedBy: { select: { id: true, name: true, email: true } },
                user: {
                    select: {
                        name: true,
                        email: true,
                        jobTitle: true,
                        department: true,
                    }
                },
                vendorQualifications: {
                    orderBy: { updatedAt: 'desc' },
                    take: 1,
                    select: {
                        id: true,
                        status: true,
                        step: true,
                        saveAsDraft: true,
                        technicalScore: true,
                        financialScore: true,
                        experienceScore: true,
                        responsivenessScore: true,
                        documentScore: true,
                        totalScore: true,
                        isAIGenerated: true,
                        aiEvaluationNotes: true,
                        engineerNotes: true,
                        recommendation: true,
                        engineerReviewedAt: true,
                        reviewerNotes: true,
                        conditionNote: true,
                        submissionDate: true,
                        updatedAt: true,
                        engineerReviewer: { select: { id: true, name: true } },
                    }
                },
            },
        });

        if (!vendor) {
            return res.status(404).json({ error: 'Vendor not found.' });
        }

        // --- NEW LOGIC: Flatten Categories and Map S3 Keys to Presigned URLs ---
        // 1. Flatten the categories array
        const simplifiedCategories = vendor.categories.map(vc => vc.category);

        // 2. Map S3 keys to presigned URLs for documents
        const documentsWithUrls = await Promise.all(
            vendor.documents.map(async (doc) => {
                const isFullUrl = doc.url.startsWith('http');
                let publicUrl = doc.url;
                
                if (!isFullUrl) {
                    // Generate presigned URL for S3 object (valid for 1 hour)
                    publicUrl = await generatePresignedUrl(doc.url, 3600) || doc.url;
                }
                
                return { ...doc, url: publicUrl };
            })
        );

        // 3. Map S3 keys to presigned URLs for projects
        const projectsWithUrls = await Promise.all(
            vendor.projectExperience.map(async (project) => {
                let completionFileUrl = project.completionFile;
                
                if (project.completionFile && !project.completionFile.startsWith('http')) {
                    completionFileUrl = await generatePresignedUrl(project.completionFile, 3600) || project.completionFile;
                }
                
                return { ...project, completionFile: completionFileUrl };
            })
        );

        // 4. Presign logo URL if it's an S3 key
        let logoUrl = vendor.logo;
        if (logoUrl && !logoUrl.startsWith('http')) {
            logoUrl = await generatePresignedUrl(logoUrl, 604800) || null;
        }

        // 5. Destructure and return the cleaned object
        const { categories, documents, projectExperience, vendorQualifications, ...restVendor } = vendor;

        res.json({
            ...restVendor,
            logo: logoUrl,
            documents: documentsWithUrls,
            projectExperience: projectsWithUrls,
            categories: simplifiedCategories,
            vendorQualifications: vendorQualifications || [],
        });

    } catch (error) {
        console.error('Error fetching vendor details:', error);
        res.status(500).json({ error: 'Failed to fetch vendor details.' });
    }
};

/**
 * Get Vendor Statistics for Dashboard
 * GET /api/vendors/stats
 */
export const getVendorStats = async (req, res) => {
    try {
        const [
            totalSuppliers,
            qualifiedSuppliers,
            underEvaluation,
            rejectedBlacklisted
        ] = await Promise.all([
            prisma.vendor.count(),
            prisma.vendor.count({ where: { status: 'APPROVED', isQualified: true } }),
            prisma.vendor.count({ where: { status: 'UNDER_REVIEW' } }),
            prisma.vendor.count({ where: { status: { in: ['REJECTED', 'BLACKLISTED'] } } })
        ]);

        res.json({
            success: true,
            data: {
                totalSuppliers,
                qualifiedSuppliers,
                underEvaluation,
                rejectedBlacklisted,
                qualifiedPercentage: Math.round((qualifiedSuppliers / Math.max(totalSuppliers, 1)) * 100)
            }
        });
    } catch (error) {
        console.error('Error fetching vendor stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Get the full Qualification details for the currently authenticated Vendor user.
 * GET /api/vendors/qualification/me
 */
export const getMyQualificationDetails = async (req, res) => {
    // 1. Ensure the user is a Vendor (roleId=4, based on your seed)
    if (req.user?.roleId !== 4) {
        return res.status(403).json({ error: 'Access denied. Only Vendor users can access this resource.' });
    }
    
    // 2. Find the associated Vendor entry using the user's ID
    const vendor = await prisma.vendor.findUnique({
        where: { userId: req.user.id },
        include: {
            documents: true,
            projectExperience: true,
            categories: {
                include: {
                    category: {
                        select: {
                            id: true,
                            name: true,
                            csiCode: true
                        }
                    }
                }
            },
        },
    });

    if (!vendor) {
        return res.status(404).json({ error: 'Vendor profile not found for this user.' });
    }

    try {
        // 1. Flatten the category array
        const simplifiedCategories = vendor.categories.map(vc => vc.category);

        // 2. Map S3 keys to presigned URLs for documents
        const documentsWithUrls = await Promise.all(
            vendor.documents.map(async (doc) => {
                const isFullUrl = doc.url.startsWith('http');
                let publicUrl = doc.url;
                
                if (!isFullUrl) {
                    publicUrl = await generatePresignedUrl(doc.url, 3600) || doc.url;
                }
                return { ...doc, url: publicUrl };
            })
        );

        // 3. Map S3 keys to presigned URLs for projects
        const projectsWithUrls = await Promise.all(
            vendor.projectExperience.map(async (project) => {
                let completionFileUrl = project.completionFile;
                
                if (project.completionFile && !project.completionFile.startsWith('http')) {
                    completionFileUrl = await generatePresignedUrl(project.completionFile, 3600) || project.completionFile;
                }
                return { ...project, completionFile: completionFileUrl };
            })
        );
        
        // 4. Generate proper logo URL if it exists - UPDATED FIX
        let logoUrl = vendor.logo;

        if (logoUrl) {
          // 1. Already a presigned URL? Keep it (though rare in your current flow)
          if (logoUrl.includes('X-Amz-Signature=')) {
            // good to go
          }
          
          // 2. Plain S3 key → generate presigned (this is the normal case now)
          else if (!logoUrl.startsWith('http')) {
            logoUrl = await generatePresignedUrl(logoUrl, 604800); // 7 days
            if (!logoUrl) logoUrl = null;
          }
          
          // 3. Legacy full direct URL → extract key and regenerate presigned
          else if (logoUrl.includes('s3.eu-north-1.amazonaws.com')) {
            try {
              const urlObj = new URL(logoUrl);
              let key = urlObj.pathname.slice(1); // remove leading /
              
              // In case bucket name is in path (rare with virtual-hosted style)
              if (key.startsWith('procurement-docss/')) {
                key = key.replace('procurement-docss/', '');
              }
              
              console.log('Converted legacy URL → key:', key);
              logoUrl = await generatePresignedUrl(key, 604800);
              if (!logoUrl) logoUrl = null;
            } catch (err) {
              console.error('Failed to convert legacy logo URL:', err);
              logoUrl = null;
            }
          }
          
          // 4. Anything else unknown → null it out
          else {
            console.warn('Invalid/unknown logo format:', logoUrl);
            logoUrl = null;
          }
        }
        
        
        // 5. Destructure and return the cleaned object WITH LOGO
        const { categories, documents, projectExperience, ...restVendor } = vendor;

        res.json({ 
            ...restVendor,
            logo: logoUrl, // Ensure logo is included
            documents: documentsWithUrls,
            projectExperience: projectsWithUrls,
            categories: simplifiedCategories,
        });

    } catch (error) {
        console.error('Error fetching vendor qualification:', error);
        res.status(500).json({ error: 'Failed to fetch vendor qualification details.' });
    }
};

/**
 * Create Vendor
 * Supports multiple category linking on creation.
 */
export const createVendor = async (req, res) => {
    try {
        const { 
            companyLegalName, 
            email, 
            contactName, 
            contactPhone, 
            address, 
            country, 
            categoryIds
        } = req.body;

        const existing = await prisma.vendor.findUnique({ where: { contactEmail: email } });
        if (existing) return res.status(400).json({ error: "Email already exists for a vendor." });

        // Prepare data for the many-to-many relationship
        const categoryConnectData = categoryIds?.length > 0
            ? categoryIds.map(id => ({
                category: { connect: { id: Number(id) } }
            }))
            : [];

        const vendor = await prisma.vendor.create({
            data: {
                companyLegalName,
                contactEmail: email,
                contactName,
                contactPhone,
                addressCountry: country,
                status: "NEW",
                categories: {
                    create: categoryConnectData,
                },
            },
            include: { 
                categories: { 
                    include: { category: true } 
                } 
            },
        });
        
        // Flatten the category response for consistency
        const simplifiedCategories = vendor.categories.map(vc => vc.category);
        const { categories, ...restVendor } = vendor;

        res.status(201).json({
            ...restVendor,
            categories: simplifiedCategories,
        });
    } catch (error) {
        console.error("Error creating vendor:", error);
        res.status(500).json({ error: "Failed to create vendor" });
    }
};

/**
 * Get Vendor Profile (Vendor looking up their own profile)
 */
export const getVendor = async (req, res) => {
    try {
        const userId = req.user?.id; 
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        const vendor = await prisma.vendor.findUnique({
            where: { userId: Number(userId) },
            select: { 
                id: true, 
                companyLegalName: true,
                vendorId: true,
                contactEmail: true, 
                status: true,
                isQualified: true,
                vendorClass: true,
            },
        });

        if (!vendor) return res.status(404).json({ error: "Vendor profile not found for this user." });
        res.json(vendor);
    } catch (error) {
        console.error("Error fetching vendor:", error);
        res.status(500).json({ error: "Failed to fetch vendor" });
    }
};

/**
 * Get all vendors (Admin List View)
 */
export const getAllVendors = async (req, res) => {
    try {
        const vendors = await prisma.vendor.findMany({
            orderBy: { createdAt: "desc" },
            include: {
                categories: {
                    include: {
                        category: {
                            select: { name: true }
                        }
                    }
                }, 
            },
        });
        
        // Flatten the category array
        const formattedVendors = vendors.map(v => {
            const categoryNames = v.categories.map(vc => vc.category.name);
            const { categories, ...rest } = v;
            return {
                ...rest,
                categoryNames: categoryNames,
            };
        });

        res.json(formattedVendors);
    } catch (error) {
        console.error("Error fetching vendors:", error);
        res.status(500).json({ error: "Failed to fetch vendors" });
    }
};

/**
 * Get vendor by ID (Admin Detailed View)
 */
export const getVendorById = async (req, res) => {
    try {
        // Authorization check
        if (req.user?.roleId !== 1 && req.user?.roleId !== 2) {
            return res.status(403).json({ error: "Access denied. Admins/Procurement only." });
        }

        const { id } = req.params;
        const vendor = await prisma.vendor.findUnique({
            where: { id: Number(id) },
            include: {
                categories: {
                    include: {
                        category: true,
                    },
                },
                assignedReviewer: { select: { id: true, name: true, email: true } },
                lastReviewedBy: { select: { id: true, name: true, email: true } },
                documents: true,
                projectExperience: true,
                contracts: true,
            },
        });

        if (!vendor) return res.status(404).json({ error: "Vendor not found" });

        // Generate presigned URLs for documents and projects
        const documentsWithUrls = await Promise.all(
            vendor.documents.map(async (doc) => {
                const isFullUrl = doc.url.startsWith('http');
                let publicUrl = doc.url;
                
                if (!isFullUrl) {
                    publicUrl = await generatePresignedUrl(doc.url, 3600) || doc.url;
                }
                return { ...doc, url: publicUrl };
            })
        );

        const projectsWithUrls = await Promise.all(
            vendor.projectExperience.map(async (project) => {
                let completionFileUrl = project.completionFile;
                
                if (project.completionFile && !project.completionFile.startsWith('http')) {
                    completionFileUrl = await generatePresignedUrl(project.completionFile, 3600) || project.completionFile;
                }
                return { ...project, completionFile: completionFileUrl };
            })
        );

        // Flatten categories
        const simplifiedCategories = vendor.categories.map(vc => vc.category);
        const { categories, documents, projectExperience, ...restVendor } = vendor;

        res.json({
            ...restVendor,
            documents: documentsWithUrls,
            projectExperience: projectsWithUrls,
            categories: simplifiedCategories,
        });
    } catch (error) {
        console.error("Error fetching vendor by ID:", error);
        res.status(500).json({ error: "Failed to fetch vendor details" });
    }
};

/**
 * Admin Update Vendor
 */
export const adminUpdateVendor = async (req, res) => {
    try {
        if (req.user?.roleId !== 1 && req.user?.roleId !== 2) {
            return res.status(403).json({ error: "Access denied" });
        }

        const { id } = req.params;
        const { 
            companyLegalName, 
            email, 
            status, 
            contactName, 
            contactPhone, 
            address, 
            country, 
            categoryIds
        } = req.body;

        const updatedData = {
            companyLegalName,
            contactEmail: email,
            status,
            contactName,
            contactPhone,
            address,
            addressCountry: country,
        };
        
        // Prepare the category sync operation
        if (Array.isArray(categoryIds)) {
            updatedData.categories = {
                deleteMany: {}, 
                create: categoryIds.map(categoryId => ({
                    categoryId: Number(categoryId),
                })),
            };
        }
        
        const updated = await prisma.vendor.update({
            where: { id: Number(id) },
            data: updatedData,
            include: { 
                categories: { 
                    include: { category: true } 
                } 
            },
        });

        // Flatten the category response
        const simplifiedCategories = updated.categories.map(vc => vc.category);
        const { categories, ...restUpdated } = updated;

        res.json({
            ...restUpdated,
            categories: simplifiedCategories,
        });
    } catch (error) {
        if (error.code === "P2025") {
            return res.status(404).json({ error: "Vendor not found" });
        }
        console.error("Error updating vendor:", error);
        res.status(500).json({ error: "Failed to update vendor" });
    }
};

/**
 * GET /api/vendor/list
 * Fetches vendor list with advanced filtering, sorting, and pagination.
 */
export const getFilteredVendorList = async (req, res) => {
    // Authorization Check
    if (req.user?.roleId !== 1 && req.user?.roleId !== 2) {
        return res.status(403).json({ error: 'Access denied. Requires Admin or Procurement privileges.' });
    }

    // Extract Query Parameters
    const { 
        search, 
        status, 
        vendorClass, 
        isQualified, 
        assignedReviewerId, 
        categoryId,
        page = 1, 
        pageSize = 20, 
        sortBy = 'createdAt', 
        sortOrder = 'desc'
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const take = parseInt(pageSize);

    // Build WHERE Clause
    let where = {};

    // Text Search
    if (search) {
        where.OR = [
            { companyLegalName: { contains: search, mode: 'insensitive' } },
            { vendorId: { contains: search, mode: 'insensitive' } },
            { contactEmail: { contains: search, mode: 'insensitive' } },
        ];
    }

    // Status Filter
    if (status) {
        where.status = status;
    }
    
    // Vendor Class Filter
    if (vendorClass) {
        where.vendorClass = vendorClass;
    }

    // Qualification Status Filter
    if (isQualified !== undefined) {
        where.isQualified = isQualified === 'true';
    }

    // Assigned Reviewer Filter
    if (assignedReviewerId) {
        where.assignedReviewerId = parseInt(assignedReviewerId);
    }
    
    // Category Filter
    if (categoryId) {
        where.categories = {
            some: {
                categoryId: parseInt(categoryId),
            },
        };
    }

    // Build ORDER BY Clause
    const orderBy = {};
    orderBy[sortBy] = sortOrder;

    try {
        // Fetch Data in a Transaction
        const [vendors, totalCount] = await prisma.$transaction([
            prisma.vendor.findMany({
                where: where,
                orderBy: orderBy,
                skip: skip,
                take: take,
                include: {
                    categories: {
                        include: {
                            category: {
                                select: { id: true, name: true, csiCode: true }
                            }
                        }
                    },
                    assignedReviewer: { 
                        select: { name: true } 
                    }
                },
            }),
            prisma.vendor.count({ where: where }),
        ]);

        // Format Output
        const formattedVendors = vendors.map(v => {
            const categoryDetails = v.categories.map(vc => vc.category);
            const { categories, assignedReviewer, ...rest } = v;
            
            return {
                ...rest,
                categories: categoryDetails,
                assignedReviewerName: assignedReviewer?.name || 'Unassigned',
            };
        });

        // Return Paginated Results
        res.status(200).json({
            data: formattedVendors,
            total: totalCount,
            page: parseInt(page),
            pageSize: parseInt(pageSize),
            totalPages: Math.ceil(totalCount / parseInt(pageSize)),
        });

    } catch (error) {
        console.error('❌ Error fetching filtered vendor list:', error);
        res.status(500).json({ error: 'Failed to fetch vendor list.' });
    }
};


/**
 * Update Vendor Qualification (Vendor self-update)
 * PUT /api/vendors/qualification/update
 */
export const updateVendorQualification = async (req, res) => {
    try {
        // 1. Ensure the user is a Vendor
        if (req.user?.roleId !== 4) {
            return res.status(403).json({ error: 'Access denied. Only Vendor users can update qualification.' });
        }

        console.log('📤 Update request received:', {
            body: req.body,
            files: req.files,
            user: req.user.id
        });

        // 2. Parse form data
        let vendorData;
        try {
            vendorData = req.body.vendorData ? JSON.parse(req.body.vendorData) : {};
        } catch (parseError) {
            return res.status(400).json({ 
                error: 'Invalid vendor data format',
                details: parseError.message 
            });
        }

        // 3. Find the vendor by userId
        const vendor = await prisma.vendor.findUnique({
            where: { userId: req.user.id },
            include: {
                documents: true,
                projectExperience: true,
                categories: {
                    include: {
                        category: true
                    }
                }
            }
        });

        if (!vendor) {
            return res.status(404).json({ error: 'Vendor profile not found.' });
        }

        // 4. Prepare update data
        const updateData = {
            // Company Information
            companyLegalName: vendorData.companyLegalName || vendor.companyLegalName,
            vendorType: vendorData.vendorType || vendor.vendorType,
            businessType: vendorData.businessType || vendor.businessType,
            licenseNumber: vendorData.licenseNumber || vendor.licenseNumber,
            yearsInBusiness: vendorData.yearsInBusiness ? parseInt(vendorData.yearsInBusiness) : vendor.yearsInBusiness,
            gosiEmployeeCount: vendorData.gosiEmployeeCount ? parseInt(vendorData.gosiEmployeeCount) : vendor.gosiEmployeeCount,
            chamberClass: vendorData.chamberClass || vendor.chamberClass,
            chamberRegion: vendorData.chamberRegion || vendor.chamberRegion,
            
            // Contact Information
            contactPerson: vendorData.contactPerson || vendor.contactPerson,
            contactPhone: vendorData.contactPhone || vendor.contactPhone,
            contactEmail: vendorData.contactEmail || vendor.contactEmail,
            website: vendorData.website || vendor.website,
            addressStreet: vendorData.addressStreet || vendor.addressStreet,
            addressCity: vendorData.addressCity || vendor.addressCity,
            addressRegion: vendorData.addressRegion || vendor.addressRegion,
            addressCountry: vendorData.addressCountry || vendor.addressCountry,
            primaryContactName: vendorData.primaryContactName || vendor.primaryContactName,
            primaryContactTitle: vendorData.primaryContactTitle || vendor.primaryContactTitle,
            technicalContactName: vendorData.technicalContactName || vendor.technicalContactName,
            technicalContactEmail: vendorData.technicalContactEmail || vendor.technicalContactEmail,
            financialContactName: vendorData.financialContactName || vendor.financialContactName,
            financialContactEmail: vendorData.financialContactEmail || vendor.financialContactEmail,
            
            // Products & Services
            productsAndServices: vendorData.productsAndServices || vendor.productsAndServices,
            
            // Reset status to under review when updating
            status: 'UNDER_REVIEW',
            reviewStatus: 'Needs Review',
            lastReviewedAt: new Date(),
        };

        // 5. Handle categories if provided
        if (vendorData.categories && Array.isArray(vendorData.categories)) {
            updateData.categories = {
                deleteMany: {},
                create: vendorData.categories.map(categoryId => ({
                    category: { connect: { id: Number(categoryId) } }
                }))
            };
        }

        // 6. Handle logo upload if present
        if (req.files && req.files.companyLogo && req.files.companyLogo[0]) {
            const logoFile = req.files.companyLogo[0];
            console.log('📷 Processing logo upload:', {
                originalName: logoFile.originalname,
                size: logoFile.size,
                mimetype: logoFile.mimetype
            });
        
            try {
                // Upload to AWS S3
                const s3Key = await uploadToS3(
                    logoFile.buffer,
                    logoFile.originalname,
                    logoFile.mimetype,
                    'logos',
                    vendor.id
                );
                
                // ✅ IMPORTANT: Store the S3 KEY, not the public URL
                updateData.logo = s3Key; // Store just the S3 key
                console.log('✅ Logo uploaded to S3, key stored:', s3Key);
        
                // Generate a presigned URL for debugging
                const presignedUrl = await generatePresignedUrl(s3Key, 604800);
                console.log('🔗 Presigned URL (valid for 7 days):', presignedUrl);
        
            } catch (logoError) {
                console.error('❌ Error processing logo:', logoError);
                return res.status(500).json({ 
                    error: 'Failed to process logo upload',
                    details: logoError.message 
                });
            }
        }

        // 7. Update vendor in database
        const updatedVendor = await prisma.vendor.update({
            where: { id: vendor.id },
            data: updateData,
            include: {
                documents: true,
                projectExperience: true,
                categories: {
                    include: {
                        category: true
                    }
                }
            }
        });

        // 8. Handle document updates (if files are provided)
        if (req.files && req.files.files && vendorData.documentData) {
            console.log('📄 Processing document uploads to S3:', req.files.files.length, 'files');
            
            // Process each uploaded file
            for (const file of req.files.files) {
                try {
                    const s3Key = await uploadToS3(
                        file.buffer,
                        file.originalname,
                        file.mimetype,
                        'documents',
                        vendor.id
                    );
                    
                    console.log('✅ Document uploaded to S3:', file.originalname, 'Key:', s3Key);
                    
                    // You can update the document record in the database here if needed
                    // This depends on your document mapping logic
                    
                } catch (docError) {
                    console.error('❌ Error uploading document to S3:', docError);
                }
            }
        }

        // 9. Handle project experience updates
        if (vendorData.projectExperience && Array.isArray(vendorData.projectExperience)) {
            console.log('🏗️ Updating project experience:', vendorData.projectExperience.length, 'projects');
            
            // Delete existing projects
            await prisma.vendorProjectExperience.deleteMany({
                where: { vendorId: vendor.id }
            });

            // Create new projects
            for (const project of vendorData.projectExperience) {
                const projectData = {
                    vendorId: vendor.id,
                    projectName: project.projectName,
                    clientName: project.clientName,
                    contractValue: parseFloat(project.contractValue) || 0,
                    startDate: project.startDate ? new Date(project.startDate) : null,
                    endDate: project.endDate ? new Date(project.endDate) : null,
                    scopeDescription: project.scopeDescription,
                    referenceContact: project.referenceContact,
                    completionFile: null
                };

                await prisma.vendorProjectExperience.create({
                    data: projectData
                });
            }
        }

        // 10. Create audit log
        await prisma.auditLog.create({
            data: {
                userId: req.user.id,
                action: 'UPDATE_VENDOR_QUALIFICATION',
                entity: 'VENDOR',
                entityId: vendor.id,
                data: {
                    updatedFields: Object.keys(updateData),
                    timestamp: new Date().toISOString()
                }
            }
        });

        // 11. Fetch updated vendor data with proper formatting
        const finalVendor = await prisma.vendor.findUnique({
            where: { id: vendor.id },
            include: {
                documents: true,
                projectExperience: true,
                categories: {
                    include: {
                        category: true
                    }
                }
            }
        });

        // Generate presigned URLs for all documents
        const documentsWithUrls = await Promise.all(
            finalVendor.documents.map(async (doc) => {
                const url = await generatePresignedUrl(doc.url, 3600) || doc.url;
                return { ...doc, url };
            })
        );

        // Generate presigned URLs for project files
        const projectsWithUrls = await Promise.all(
            finalVendor.projectExperience.map(async (project) => {
                let completionFileUrl = project.completionFile;
                if (project.completionFile && !project.completionFile.startsWith('http')) {
                    completionFileUrl = await generatePresignedUrl(project.completionFile, 3600) || project.completionFile;
                }
                return { ...project, completionFile: completionFileUrl };
            })
        );

        // Flatten categories for response
        const simplifiedCategories = finalVendor.categories.map(vc => vc.category);
        const { categories, documents, projectExperience, ...restVendor } = finalVendor;

        res.json({
            success: true,
            message: 'Qualification updated successfully and submitted for review.',
            data: {
                ...restVendor,
                documents: documentsWithUrls,
                projectExperience: projectsWithUrls,
                categories: simplifiedCategories,
            }
        });

    } catch (error) {
        console.error('❌ Error updating vendor qualification:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to update qualification',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

/**
 * GET /api/categories
 * Get all available categories
 */
export const getAllCategories = async (req, res) => {
    try {
        const categories = await prisma.category.findMany({
            orderBy: { name: 'asc' }
        });

        res.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
};

/**
 * Upload or replace a vendor document
 * PUT /api/vendors/:id/documents/:docType
 */
export const uploadVendorDocument = async (req, res) => {
    const vendorId = parseInt(req.params.id);
    const { docType } = req.params;
    const file = req.file;

    if (isNaN(vendorId)) return res.status(400).json({ error: 'Invalid vendor ID' });
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    try {
        const s3Key = await uploadToS3(file.buffer, file.originalname, file.mimetype, 'vendor-documents', vendorId);
        const fileUrl = getPublicUrl(s3Key);

        const existing = await prisma.vendorDocument.findFirst({
            where: { vendorId, docType },
        });

        let document;
        const expiryDate = req.body.expiryDate ? new Date(req.body.expiryDate) : undefined;

        if (existing) {
            document = await prisma.vendorDocument.update({
                where: { id: existing.id },
                data: {
                    url: fileUrl,
                    fileName: file.originalname,
                    uploadedAt: new Date(),
                    isVerified: false,
                    verifiedBy: null,
                    verificationDate: null,
                    ...(expiryDate !== undefined && { expiryDate }),
                },
            });
        } else {
            document = await prisma.vendorDocument.create({
                data: {
                    vendorId,
                    docType,
                    url: fileUrl,
                    fileName: file.originalname,
                    ...(expiryDate !== undefined && { expiryDate }),
                },
            });
        }

        res.json(document);
    } catch (error) {
        console.error('Error uploading vendor document:', error);
        res.status(500).json({ error: 'Failed to upload document' });
    }
};

// ─── Qualification & Evaluation ──────────────────────────────────────────────

/**
 * Check if a CR number already exists
 * GET /api/vendors/check-cr?crNumber=XXX
 */
export const checkCrNumber = async (req, res) => {
    const { crNumber } = req.query;
    if (!crNumber) return res.status(400).json({ error: 'crNumber is required' });
    try {
        const vendor = await prisma.vendor.findUnique({ where: { crNumber } });
        if (!vendor) return res.json({ exists: false });
        // If caller is the vendor role, check if it's their own record
        if (req.user?.roleId === 4) {
            const own = await prisma.vendor.findUnique({ where: { userId: req.user.id } });
            return res.json({ exists: own?.crNumber !== crNumber });
        }
        res.json({ exists: true });
    } catch (error) {
        console.error('Error checking CR number:', error);
        res.status(500).json({ error: 'Failed to check CR number' });
    }
};

/**
 * Get the vendor's current draft qualification
 * GET /api/vendor/qualification/draft
 */
export const getQualificationDraft = async (req, res) => {
    try {
        const vendor = await prisma.vendor.findUnique({
            where: { userId: req.user.id },
            include: {
                documents: true,
                contacts: true,
                teamMembers: true,
                projectExperience: true,
                categories: { include: { category: { select: { id: true, name: true, csiCode: true } } } },
            },
        });
        if (!vendor) return res.status(404).json({ error: 'Vendor profile not found' });

        const qualification = await prisma.vendorQualification.findFirst({
            where: { vendorId: vendor.id, saveAsDraft: true },
            orderBy: { updatedAt: 'desc' },
        });

        const simplifiedCategories = vendor.categories.map(vc => vc.category);
        // Presign document URLs
        const documents = await Promise.all(
            vendor.documents.map(async (doc) => {
                if (doc.url && !doc.url.startsWith('http')) {
                    const url = await generatePresignedUrl(doc.url, 3600) || doc.url;
                    return { ...doc, url };
                }
                return doc;
            })
        );

        res.json({ vendor: { ...vendor, categories: simplifiedCategories, documents }, qualification });
    } catch (error) {
        console.error('Error getting qualification draft:', error);
        res.status(500).json({ error: 'Failed to get draft' });
    }
};

/**
 * Save qualification form as draft
 * POST /api/vendor/qualification/save-draft
 */
export const saveQualificationDraft = async (req, res) => {
    try {
        const vendor = await prisma.vendor.findUnique({ where: { userId: req.user.id }, include: { documents: true } });
        if (!vendor) return res.status(404).json({ error: 'Vendor profile not found' });

        const {
            companyLegalName, companyNameArabic, brandName, companySummary,
            vendorType, crNumber, vatNumber, zakatNumber, yearsInBusiness, gosiEmployeeCount,
            chamberClass, chamberExpiryDate, ownershipType,
            addressStreet, addressCity, addressRegion, addressCountry,
            website, headOfficeLocation,
            contacts = [], teamMembers = [], categoryIds = [], step = 1,
            projects = [], productsAndServices = [],
        } = req.body;

        // Update vendor fields
        const updatedVendor = await prisma.vendor.update({
            where: { id: vendor.id },
            data: {
                ...(companyLegalName !== undefined && { companyLegalName }),
                ...(companyNameArabic !== undefined && { companyNameArabic }),
                ...(brandName !== undefined && { brandName }),
                ...(companySummary !== undefined && { companySummary }),
                ...(vendorType !== undefined && { vendorType }),
                ...(crNumber !== undefined && { crNumber }),
                ...(vatNumber !== undefined && { vatNumber }),
                ...(zakatNumber !== undefined && { zakatNumber }),
                ...(yearsInBusiness !== undefined && { yearsInBusiness: parseInt(yearsInBusiness) }),
                ...(gosiEmployeeCount !== undefined && { gosiEmployeeCount: parseInt(gosiEmployeeCount) }),
                ...(chamberClass !== undefined && { chamberClass }),
                ...(chamberExpiryDate !== undefined && { chamberExpiryDate: chamberExpiryDate ? new Date(chamberExpiryDate) : null }),
                ...(ownershipType !== undefined && { ownershipType }),
                ...(addressStreet !== undefined && { addressStreet }),
                ...(addressCity !== undefined && { addressCity }),
                ...(addressRegion !== undefined && { addressRegion }),
                ...(addressCountry !== undefined && { addressCountry }),
                ...(website !== undefined && { website }),
                ...(headOfficeLocation !== undefined && { headOfficeLocation }),
                ...(productsAndServices.length > 0 && { productsAndServices }),
            },
        });

        // Upsert contacts
        if (contacts.length > 0) {
            await prisma.vendorContact.deleteMany({ where: { vendorId: vendor.id } });
            await prisma.vendorContact.createMany({
                data: contacts.map(c => ({ vendorId: vendor.id, ...c })),
            });
        }

        // Upsert team members
        if (teamMembers.length > 0) {
            await prisma.vendorTeamMember.deleteMany({ where: { vendorId: vendor.id } });
            await prisma.vendorTeamMember.createMany({
                data: teamMembers.map(m => ({ vendorId: vendor.id, ...m })),
            });
        }

        // Calculate profileCompletionPct
        const hasCompanyInfo = !!(companyLegalName || vendor.companyLegalName);
        const hasContacts = contacts.length > 0 || (await prisma.vendorContact.count({ where: { vendorId: vendor.id } })) > 0;
        const docCount = vendor.documents.length;
        const hasExperience = projects.length > 0 || vendor.productsAndServices?.length > 0;
        const hasCategories = categoryIds.length > 0;
        const pct = [hasCompanyInfo, hasContacts, docCount >= 5, hasExperience, hasCategories]
            .filter(Boolean).length * 20;

        await prisma.vendor.update({ where: { id: vendor.id }, data: { profileCompletionPct: pct } });

        // Upsert VendorQualification (draft)
        const existingQ = await prisma.vendorQualification.findFirst({
            where: { vendorId: vendor.id, saveAsDraft: true },
            orderBy: { updatedAt: 'desc' },
        });

        let qualification;
        if (existingQ) {
            qualification = await prisma.vendorQualification.update({
                where: { id: existingQ.id },
                data: { step, saveAsDraft: true },
            });
        } else {
            qualification = await prisma.vendorQualification.create({
                data: { vendorId: vendor.id, step, saveAsDraft: true, status: 'DRAFT' },
            });
        }

        res.json({ vendor: updatedVendor, qualification });
    } catch (error) {
        console.error('Error saving qualification draft:', error);
        res.status(500).json({ error: 'Failed to save draft' });
    }
};

/**
 * Submit qualification for review
 * POST /api/vendor/qualification/submit
 */
export const submitQualification = async (req, res) => {
    try {
        const vendor = await prisma.vendor.findUnique({
            where: { userId: req.user.id },
            include: { documents: true, user: { select: { email: true, name: true } } },
        });
        if (!vendor) return res.status(404).json({ error: 'Vendor profile not found' });

        const BASE_REQUIRED = [
            'COMMERCIAL_REGISTRATION', 'ZAKAT_CERTIFICATE', 'VAT_CERTIFICATE', 'GOSI_CERTIFICATE',
            'ISO_CERTIFICATE', 'BANK_LETTER', 'COMPANY_PROFILE', 'FINANCIAL_FILE', 'VENDOR_CODE_OF_CONDUCT',
        ];
        const CONTRACTOR_REQUIRED = ['HSE_PLAN', 'INSURANCE_CERTIFICATE', 'ORGANIZATION_CHART', 'QUALITY_PLAN'];
        const SUPPLIER_REQUIRED = ['SASO_SABER_CERTIFICATE', 'TECHNICAL_FILE'];

        const vType = vendor.vendorType || '';
        const isContractor = ['Contractor', 'Subcontractor'].includes(vType);
        const isSupplier = ['Supplier', 'Manufacturer', 'Distributor'].includes(vType);

        const required = [
            ...BASE_REQUIRED,
            ...(isContractor ? CONTRACTOR_REQUIRED : []),
            ...(isSupplier ? SUPPLIER_REQUIRED : []),
        ];

        const now = new Date();
        const uploadedTypes = vendor.documents
            .filter(d => !d.expiryDate || new Date(d.expiryDate) >= now)
            .map(d => d.docType);

        const missing = required.filter(r => !uploadedTypes.includes(r));
        if (missing.length > 0) {
            return res.status(400).json({ error: 'Missing or expired mandatory documents', missing });
        }

        // Update vendor and qualification
        const updatedVendor = await prisma.vendor.update({
            where: { id: vendor.id },
            data: { status: 'UNDER_REVIEW' },
        });

        const existingQ = await prisma.vendorQualification.findFirst({
            where: { vendorId: vendor.id },
            orderBy: { updatedAt: 'desc' },
        });

        if (existingQ) {
            await prisma.vendorQualification.update({
                where: { id: existingQ.id },
                data: { saveAsDraft: false, submissionDate: now, status: 'SUBMITTED' },
            });
        } else {
            await prisma.vendorQualification.create({
                data: { vendorId: vendor.id, saveAsDraft: false, submissionDate: now, status: 'SUBMITTED' },
            });
        }

        // Send emails (non-blocking)
        const vendorEmail = vendor.user?.email;
        if (vendorEmail) {
            emailService.sendEmail({
                to: vendorEmail,
                subject: 'Qualification Submission Confirmed — Procurement ERP',
                html: `<p>Dear ${vendor.user?.name || vendor.companyLegalName},</p>
                       <p>Your vendor qualification has been successfully submitted and is now under review by our procurement team.</p>
                       <p>We will notify you once the review is complete. Your reference number is <strong>#${vendor.vendorId || vendor.id}</strong>.</p>
                       <p>Best regards,<br/>Procurement Team</p>`,
            }).catch(err => console.warn('Vendor email failed:', err.message));
        }

        const procEmail = process.env.PROCUREMENT_EMAIL;
        if (procEmail) {
            emailService.sendEmail({
                to: procEmail,
                subject: `New Vendor Qualification Submitted — ${vendor.companyLegalName}`,
                html: `<p>A new vendor qualification has been submitted and requires review.</p>
                       <p><strong>Company:</strong> ${vendor.companyLegalName}<br/>
                       <strong>Type:</strong> ${vendor.vendorType}<br/>
                       <strong>CR:</strong> ${vendor.crNumber || 'N/A'}</p>
                       <p>Please log in to review the submission.</p>`,
            }).catch(err => console.warn('Procurement email failed:', err.message));
        }

        res.json({ success: true, vendor: updatedVendor });
    } catch (error) {
        console.error('Error submitting qualification:', error);
        res.status(500).json({ error: 'Failed to submit qualification' });
    }
};

/**
 * Run AI evaluation for a vendor
 * POST /api/vendors/:id/evaluation/ai
 */
export const runAIEvaluation = async (req, res) => {
    const vendorId = parseInt(req.params.id);
    if (isNaN(vendorId)) return res.status(400).json({ error: 'Invalid vendor ID' });

    try {
        const vendor = await prisma.vendor.findUnique({
            where: { id: vendorId },
            include: { documents: true, projectExperience: true },
        });
        if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

        const now = new Date();
        const ALL_REQUIRED = [
            'COMMERCIAL_REGISTRATION', 'ZAKAT_CERTIFICATE', 'VAT_CERTIFICATE', 'GOSI_CERTIFICATE',
            'ISO_CERTIFICATE', 'BANK_LETTER', 'COMPANY_PROFILE', 'FINANCIAL_FILE', 'VENDOR_CODE_OF_CONDUCT',
        ];
        const validDocs = vendor.documents.filter(d => !d.expiryDate || new Date(d.expiryDate) >= now);
        const validDocTypes = validDocs.map(d => d.docType);
        const requiredPresent = ALL_REQUIRED.filter(r => validDocTypes.includes(r)).length;

        const documentScore = parseFloat(((requiredPresent / ALL_REQUIRED.length) * 10).toFixed(2));
        const responsivenessScore = parseFloat(req.body.responsivenessScore) || 7;
        const technicalScore = parseFloat(req.body.technicalScore) || 5;
        const financialScore = parseFloat(req.body.financialScore) || 5;
        const experienceScore = vendor.projectExperience.length > 0
            ? Math.min(10, vendor.projectExperience.length * 2)
            : 5;

        const totalScore = parseFloat(
            (documentScore * 0.20 + technicalScore * 0.25 + financialScore * 0.20 + experienceScore * 0.25 + responsivenessScore * 0.10) * 10
        ).toFixed(1);

        const vendorClass = totalScore >= 85 ? 'A' : totalScore >= 70 ? 'B' : totalScore >= 55 ? 'C' : 'D';

        // Upsert qualification
        const existing = await prisma.vendorQualification.findFirst({
            where: { vendorId },
            orderBy: { updatedAt: 'desc' },
        });

        let qualification;
        const scoreData = {
            documentScore, technicalScore, financialScore, experienceScore, responsivenessScore,
            totalScore: parseFloat(totalScore),
            isAIGenerated: true,
            aiEvaluationNotes: `AI evaluation: ${requiredPresent}/${ALL_REQUIRED.length} required docs valid. ${vendor.projectExperience.length} project(s) on record.`,
            status: 'UNDER_REVIEW',
            saveAsDraft: false,
        };

        if (existing) {
            qualification = await prisma.vendorQualification.update({ where: { id: existing.id }, data: scoreData });
        } else {
            qualification = await prisma.vendorQualification.create({ data: { vendorId, ...scoreData } });
        }

        // Update vendor scores
        await prisma.vendor.update({
            where: { id: vendorId },
            data: { qualificationScore: parseFloat(totalScore), vendorClass, lastEvaluatedAt: now },
        });

        await logAudit(req.user.id, 'AI_EVALUATION_RUN', 'VendorQualification', qualification.id, { vendorId, totalScore });

        res.json({
            qualification,
            breakdown: { documentScore, technicalScore, financialScore, experienceScore, responsivenessScore },
            totalScore: parseFloat(totalScore),
            vendorClass,
        });
    } catch (error) {
        console.error('Error running AI evaluation:', error);
        res.status(500).json({ error: 'Failed to run AI evaluation' });
    }
};

/**
 * Submit engineer review of AI evaluation
 * POST /api/vendors/:id/evaluation/review
 */
export const submitEngineerReview = async (req, res) => {
    const vendorId = parseInt(req.params.id);
    if (isNaN(vendorId)) return res.status(400).json({ error: 'Invalid vendor ID' });

    try {
        const { technicalScore, financialScore, experienceScore, engineerNotes, recommendation } = req.body;
        if (!engineerNotes) return res.status(400).json({ error: 'engineerNotes is required' });
        if (!recommendation) return res.status(400).json({ error: 'recommendation is required' });

        const existing = await prisma.vendorQualification.findFirst({
            where: { vendorId },
            orderBy: { updatedAt: 'desc' },
        });
        if (!existing) return res.status(404).json({ error: 'No qualification record found. Run AI evaluation first.' });

        const tScore = parseFloat(technicalScore) || existing.technicalScore || 5;
        const fScore = parseFloat(financialScore) || existing.financialScore || 5;
        const eScore = parseFloat(experienceScore) || existing.experienceScore || 5;
        const dScore = existing.documentScore || 5;
        const rScore = existing.responsivenessScore || 7;

        const totalScore = parseFloat(
            (dScore * 0.20 + tScore * 0.25 + fScore * 0.20 + eScore * 0.25 + rScore * 0.10) * 10
        ).toFixed(1);

        const qualification = await prisma.vendorQualification.update({
            where: { id: existing.id },
            data: {
                technicalScore: tScore,
                financialScore: fScore,
                experienceScore: eScore,
                totalScore: parseFloat(totalScore),
                engineerNotes,
                recommendation,
                engineerReviewerId: req.user.id,
                engineerReviewedAt: new Date(),
                status: 'ENGINEER_REVIEWED',
            },
        });

        await logAudit(req.user.id, 'ENGINEER_REVIEW_SUBMITTED', 'VendorQualification', qualification.id, { vendorId, recommendation });

        res.json(qualification);
    } catch (error) {
        console.error('Error submitting engineer review:', error);
        res.status(500).json({ error: 'Failed to submit engineer review' });
    }
};

/**
 * Admin action on vendor qualification
 * POST /api/vendors/:id/qualification/admin-action
 */
export const adminAction = async (req, res) => {
    const vendorId = parseInt(req.params.id);
    if (isNaN(vendorId)) return res.status(400).json({ error: 'Invalid vendor ID' });

    try {
        const {
            action, vendorClass, notes, nextReviewDate,
            assignedReviewerId, sendEmailToVendor, conditionNote,
        } = req.body;

        // Role enforcement
        if (['CONDITIONAL_APPROVE', 'BLACKLIST'].includes(action) && req.user.roleId > 2) {
            return res.status(403).json({ error: 'This action requires Manager role or above' });
        }

        const STATUS_MAP = {
            APPROVE: 'APPROVED',
            REJECT: 'REJECTED',
            NEEDS_RENEWAL: 'NEEDS_RENEWAL',
            SEND_FOR_CORRECTION: 'UNDER_REVIEW',
            TEMPORARY_HOLD: 'TEMPORARY_HOLD',
            CONDITIONAL_APPROVE: 'CONDITIONAL_APPROVED',
            BLACKLIST: 'BLACKLISTED',
        };

        const newStatus = STATUS_MAP[action];
        if (!newStatus) return res.status(400).json({ error: 'Invalid action' });

        const isApproved = ['APPROVE', 'CONDITIONAL_APPROVE'].includes(action);

        const vendor = await prisma.vendor.update({
            where: { id: vendorId },
            data: {
                status: newStatus,
                ...(vendorClass && { vendorClass }),
                reviewNotes: notes || null,
                ...(assignedReviewerId && { assignedReviewerId: parseInt(assignedReviewerId) }),
                ...(nextReviewDate && { nextReviewDate: new Date(nextReviewDate) }),
                conditionalApproval: action === 'CONDITIONAL_APPROVE',
                ...(conditionNote !== undefined && { conditionalNote: conditionNote }),
                isQualified: isApproved,
                lastReviewedById: req.user.id,
                lastReviewedAt: new Date(),
            },
            include: { user: { select: { email: true, name: true } } },
        });

        // Update qualification record
        await prisma.vendorQualification.updateMany({
            where: { vendorId },
            data: { status: newStatus, reviewerNotes: notes || null, conditionNote: conditionNote || null },
        });

        await logAudit(req.user.id, `VENDOR_${action}`, 'Vendor', vendorId, { action, newStatus, notes });

        // Send email to vendor
        if (sendEmailToVendor && vendor.user?.email) {
            const actionLabels = {
                APPROVE: 'Approved', REJECT: 'Rejected', NEEDS_RENEWAL: 'Needs Renewal',
                SEND_FOR_CORRECTION: 'Sent for Correction', TEMPORARY_HOLD: 'Temporarily On Hold',
                CONDITIONAL_APPROVE: 'Conditionally Approved', BLACKLIST: 'Blacklisted',
            };
            const label = actionLabels[action] || action;
            emailService.sendEmail({
                to: vendor.user.email,
                subject: `Your Vendor Qualification Status — ${label}`,
                html: `<p>Dear ${vendor.user.name || vendor.companyLegalName},</p>
                       <p>Your vendor qualification status has been updated to: <strong>${label}</strong>.</p>
                       ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
                       ${conditionNote ? `<p><strong>Conditions:</strong> ${conditionNote}</p>` : ''}
                       <p>Please log in to your vendor portal for further details.</p>
                       <p>Best regards,<br/>Procurement Team</p>`,
            }).catch(err => console.warn('Vendor status email failed:', err.message));
        }

        // In-app notification for vendor user
        if (vendor.user?.id || vendor.userId) {
            const vendorUserId = vendor.user?.id || vendor.userId;
            notificationService.createNotification({
                userId: vendorUserId,
                title: isApproved ? 'Vendor Application Approved' : `Vendor Status Updated`,
                body: notes || (isApproved ? 'Your vendor application has been approved.' : `Your vendor status has been updated to ${newStatus.replace(/_/g,' ')}.`),
                type: isApproved ? 'INFO' : 'WARNING',
                priority: 'HIGH',
                actionUrl: '/dashboard/vendor',
                module: 'VENDOR',
                entityId: vendorId,
                entityType: 'Vendor'
            }).catch(err => console.warn('Vendor notification failed:', err.message));
        }

        res.json({ success: true, vendor });
    } catch (error) {
        console.error('Error performing admin action:', error);
        res.status(500).json({ error: 'Failed to perform admin action' });
    }
};

/**
 * Verify or unverify a vendor document
 * PATCH /api/vendors/:id/documents/:docType/verify
 */
export const verifyVendorDocument = async (req, res) => {
    const vendorId = parseInt(req.params.id);
    const { docType } = req.params;
    const { verified } = req.body;

    if (isNaN(vendorId)) return res.status(400).json({ error: 'Invalid vendor ID' });
    if (verified === undefined) return res.status(400).json({ error: 'verified field is required' });

    try {
        const existing = await prisma.vendorDocument.findFirst({
            where: { vendorId, docType },
        });

        if (!existing) return res.status(404).json({ error: 'Document not found' });

        const document = await prisma.vendorDocument.update({
            where: { id: existing.id },
            data: {
                isVerified: Boolean(verified),
                verifiedBy: verified ? (req.user?.name || req.user?.email || 'Unknown') : null,
                verificationDate: verified ? new Date() : null,
            },
        });

        res.json(document);
    } catch (error) {
        console.error('Error verifying vendor document:', error);
        res.status(500).json({ error: 'Failed to verify document' });
    }
};

/**
 * Get vendors with documents expiring in next 30 days, grouped by urgency
 * GET /api/vendors/document-alerts
 */
export const getDocumentAlerts = async (req, res) => {
    try {
        const now = new Date();
        const in30Days = new Date(now.getTime() + 30 * 86400000);

        const docs = await prisma.vendorDocument.findMany({
            where: {
                expiryDate: { gte: now, lte: in30Days },
                vendor: { status: { in: ['APPROVED', 'CONDITIONAL_APPROVED', 'UNDER_REVIEW'] } }
            },
            include: {
                vendor: { select: { id: true, companyLegalName: true, vendorClass: true, status: true } }
            },
            orderBy: { expiryDate: 'asc' }
        });

        const alerts = docs.map(d => {
            const daysLeft = Math.ceil((new Date(d.expiryDate) - now) / 86400000);
            return {
                id: d.id,
                vendorId: d.vendorId,
                docType: d.docType || d.documentType,
                expiryDate: d.expiryDate,
                daysLeft,
                urgency: daysLeft <= 7 ? 'CRITICAL' : daysLeft <= 15 ? 'WARNING' : 'NOTICE',
                vendor: d.vendor
            };
        });

        const summary = {
            critical: alerts.filter(a => a.urgency === 'CRITICAL').length,
            warning: alerts.filter(a => a.urgency === 'WARNING').length,
            notice: alerts.filter(a => a.urgency === 'NOTICE').length
        };

        res.json({ summary, alerts: alerts.slice(0, 50) });
    } catch (error) {
        console.error('Error fetching document alerts:', error);
        res.status(500).json({ error: 'Failed to fetch document alerts' });
    }
};