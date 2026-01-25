import prisma from "../config/prismaClient.js";
import { generatePresignedUrl, getPublicUrl } from '../lib/awsS3.js';
import path from 'path';

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

        // 4. Destructure and return the cleaned object
        const { categories, documents, projectExperience, ...restVendor } = vendor;

        res.json({ 
            ...restVendor,
            documents: documentsWithUrls,
            projectExperience: projectsWithUrls,
            categories: simplifiedCategories,
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

// Import AWS S3 upload function
import { uploadToS3 } from '../lib/awsS3.js';

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