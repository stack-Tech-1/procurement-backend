import prisma from "../config/prismaClient.js";
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import path from 'path'; 

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'vendor-documents';


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
    
    // FIX: Add this debug log to see what's being received
    console.log('🔍 Fetching vendor details for ID:', vendorId);
    
    // Authorization check (Ensure only Procurement/Admin/Vendor can access their own)
    // ... (Your existing authorization logic)
  
    try {
        // FIX: Use the parsed vendorId
        const vendor = await prisma.vendor.findUnique({
            where: { id: vendorId },  // Use the parsed integer
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

      // --- NEW LOGIC: Flatten Categories and Map Storage Paths to Public URLs ---
      // 1. Flatten the categories array (convert VendorToCategory[] to Category[])
      const simplifiedCategories = vendor.categories.map(vc => vc.category);

      // 2. Map storage paths to public URLs for documents and projects (existing logic, preserved)
      const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'vendor-documents';
      
      const documentsWithUrls = vendor.documents.map(doc => {
          const isFullUrl = doc.url.startsWith('http');
          let publicUrl = doc.url;
          if (!isFullUrl) {
              const { data } = supabaseAdmin.storage
                  .from(STORAGE_BUCKET)
                  .getPublicUrl(doc.url);
              publicUrl = data?.publicUrl || doc.url;
          }
          return { ...doc, url: publicUrl };
      });

      const projectsWithUrls = vendor.projectExperience.map(project => {
          let completionFileUrl = project.completionFile;
          if (project.completionFile && !project.completionFile.startsWith('http')) {
              const { data } = supabaseAdmin.storage
                  .from(STORAGE_BUCKET)
                  .getPublicUrl(project.completionFile);
              completionFileUrl = data?.publicUrl || project.completionFile;
          }
          return { ...project, completionFile: completionFileUrl };
      });

      // 3. Destructure and return the cleaned object
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




/** * Get Vendor Statistics for Dashboard
 * GET /api/vendors/stats
 * Accessible by Admin and Procurement roles.
 * Returns total suppliers, qualified suppliers, under evaluation, rejected/blacklisted counts.
 * Also returns percentage of qualified suppliers.
 * */
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
          // ✅ NEW: Include Categories (Many-to-Many)
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
      // --- NEW LOGIC: Flatten Categories and Map Storage Paths to Public URLs ---
      const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'vendor-documents'; 

      // 1. Flatten the categories array
      const simplifiedCategories = vendor.categories.map(vc => vc.category);

      // 2. Map storage paths to public URLs for documents (existing logic, preserved)
      const documentsWithUrls = vendor.documents.map(doc => {
          const isFullUrl = doc.url.startsWith('http');
          let publicUrl = doc.url;
          
          if (!isFullUrl) {
              const { data } = supabaseAdmin.storage
                  .from(STORAGE_BUCKET)
                  .getPublicUrl(doc.url);
              publicUrl = data?.publicUrl || doc.url;
          }

          return { ...doc, url: publicUrl };
      });

      // 3. Map storage paths to public URLs for projects (existing logic, preserved)
      const projectsWithUrls = vendor.projectExperience.map(project => {
          let completionFileUrl = project.completionFile;
          
          if (project.completionFile && !project.completionFile.startsWith('http')) {
              const { data } = supabaseAdmin.storage
                  .from(STORAGE_BUCKET)
                  .getPublicUrl(project.completionFile);
              completionFileUrl = data?.publicUrl || project.completionFile;
          }

          return { ...project, completionFile: completionFileUrl };
      });
      
      // 4. Destructure and return the cleaned object
      const { categories, documents, projectExperience, ...restVendor } = vendor;

      res.json({ 
          ...restVendor,
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
          categoryIds // ✅ UPDATED: Array of IDs [1, 5, 10]
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
              addressCountry: country, // Assuming 'country' maps to 'addressCountry'
              status: "NEW",
              // ✅ NEW: Connect to multiple categories using the junction table
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
      // We assume userId from JWT maps directly to the Vendor's associated User ID
      const userId = req.user?.id; 
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const vendor = await prisma.vendor.findUnique({
          // ✅ UPDATED: Find vendor by the new 'userId' field
          where: { userId: Number(userId) },
          select: { 
              id: true, 
              companyLegalName: true, // ✅ UPDATED
              vendorId: true, // Use vendorId for external code
              contactEmail: true, 
              status: true,
              isQualified: true,
              vendorClass: true, // Include new qualification fields
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
  // NOTE: This endpoint is similar to /api/vendor/list but without filtering/pagination.
  // It's often kept for simpler admin views or exports.
  try {
      const vendors = await prisma.vendor.findMany({
          orderBy: { createdAt: "desc" },
          include: {
              // ✅ UPDATED: Include categories via the junction table
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
      // Authorization check (assuming this is for a detailed admin/procurement view)
      if (req.user?.roleId !== 1 && req.user?.roleId !== 2)
          return res.status(403).json({ error: "Access denied. Admins/Procurement only." });

      const { id } = req.params;
      const vendor = await prisma.vendor.findUnique({
          where: { id: Number(id) },
          include: {
              // ✅ UPDATED: Include categories
              categories: {
                  include: {
                      category: true,
                  },
              },
              // ✅ NEW: Include Reviewers
              assignedReviewer: { select: { id: true, name: true, email: true } },
              lastReviewedBy: { select: { id: true, name: true, email: true } },
              // Retain other relations
              contracts: true,
              documents: true,
              // ... (other includes)
          },
      });

      if (!vendor) return res.status(404).json({ error: "Vendor not found" });

      // Flatten categories
      const simplifiedCategories = vendor.categories.map(vc => vc.category);
      const { categories, ...restVendor } = vendor;

      res.json({
          ...restVendor,
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
      if (req.user?.roleId !== 1 && req.user?.roleId !== 2)
          return res.status(403).json({ error: "Access denied" });

      const { id } = req.params;
      const { 
          companyLegalName, 
          email, 
          status, 
          contactName, 
          contactPhone, 
          address, 
          country, 
          categoryIds // ✅ UPDATED: Array of IDs to sync
      } = req.body;

      const updatedData = {
          companyLegalName,
          contactEmail: email,
          status,
          contactName,
          contactPhone,
          address,
          addressCountry: country, // Assuming 'country' maps to 'addressCountry'
      };
      
      // Prepare the category sync operation
      if (Array.isArray(categoryIds)) {
          updatedData.categories = {
              // Delete all current links and create new ones
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
 * Accessible by Admin (1) and Procurement (2).
 */
export const getFilteredVendorList = async (req, res) => {
  // 1. Authorization Check (Already handled by role-specific middleware, but good to double check)
  if (req.user?.roleId !== 1 && req.user?.roleId !== 2) {
      return res.status(403).json({ error: 'Access denied. Requires Admin or Procurement privileges.' });
  }

  // 2. Extract Query Parameters
  const { 
      search, 
      status, 
      vendorClass, 
      isQualified, 
      assignedReviewerId, 
      categoryId, // New filter for categories
      page = 1, 
      pageSize = 20, 
      sortBy = 'createdAt', 
      sortOrder = 'desc' // 'asc' or 'desc'
  } = req.query;

  const skip = (parseInt(page) - 1) * parseInt(pageSize);
  const take = parseInt(pageSize);

  // 3. Build WHERE Clause
  let where = {};

  // Text Search (Searches Vendor Name and Vendor ID)
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

  // Assigned Reviewer Filter (Used for team management/dashboard)
  if (assignedReviewerId) {
      where.assignedReviewerId = parseInt(assignedReviewerId);
  }
  
  // Category Filter (Uses the junction table relationship)
  if (categoryId) {
      where.categories = {
          some: {
              categoryId: parseInt(categoryId),
          },
      };
  }

  // 4. Build ORDER BY Clause
  const orderBy = {};
  orderBy[sortBy] = sortOrder;

  try {
      // 5. Fetch Data in a Transaction
      const [vendors, totalCount] = await prisma.$transaction([
          prisma.vendor.findMany({
              where: where,
              orderBy: orderBy,
              skip: skip,
              take: take,
              include: {
                  // Include categories (Name and CSI Code)
                  categories: {
                      include: {
                          category: {
                              select: { id: true, name: true, csiCode: true }
                          }
                      }
                  },
                  // Include assigned reviewer name
                  assignedReviewer: { 
                      select: { name: true } 
                  }
              },
          }),
          prisma.vendor.count({ where: where }),
      ]);

      // 6. Format Output
      const formattedVendors = vendors.map(v => {
          const categoryDetails = v.categories.map(vc => vc.category);
          const { categories, assignedReviewer, ...rest } = v;
          
          return {
              ...rest,
              categories: categoryDetails,
              assignedReviewerName: assignedReviewer?.name || 'Unassigned',
          };
      });

      // 7. Return Paginated Results
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
  
        const logoFileName = `vendor-${vendor.id}-logo-${Date.now()}${path.extname(logoFile.originalname)}`;
        
        try {
          // Upload to Supabase storage
          const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from(STORAGE_BUCKET)
            .upload(`logos/${logoFileName}`, logoFile.buffer, {
              contentType: logoFile.mimetype,
              cacheControl: '3600',
              upsert: true
            });
  
          if (uploadError) {
            console.error('❌ Logo upload error:', uploadError);
            throw new Error(`Failed to upload logo: ${uploadError.message}`);
          }
  
          const { data: publicUrlData } = supabaseAdmin.storage
            .from(STORAGE_BUCKET)
            .getPublicUrl(`logos/${logoFileName}`);
          
          updateData.logo = publicUrlData.publicUrl;
          console.log('✅ Logo uploaded successfully:', updateData.logo);
  
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
        // Note: You'll need to map file names to document types
        // This is a simplified version - you'll need to adapt based on your frontend form structure
        console.log('📄 Processing document uploads:', req.files.files.length, 'files');
        
        // Process each uploaded file
        for (const file of req.files.files) {
          const fileName = `vendor-${vendor.id}-${Date.now()}-${file.originalname}`;
          
          try {
            const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
              .from(STORAGE_BUCKET)
              .upload(`documents/${fileName}`, file.buffer, {
                contentType: file.mimetype,
                cacheControl: '3600'
              });
  
            if (!uploadError) {
              const { data: publicUrlData } = supabaseAdmin.storage
                .from(STORAGE_BUCKET)
                .getPublicUrl(`documents/${fileName}`);
  
              // You'll need to determine which document type this file belongs to
              // This depends on how your frontend sends the files
              console.log('✅ Document uploaded:', file.originalname);
            }
          } catch (docError) {
            console.error('❌ Error uploading document:', docError);
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
  
      // Flatten categories for response
      const simplifiedCategories = finalVendor.categories.map(vc => vc.category);
      const { categories, ...restVendor } = finalVendor;
  
      res.json({
        success: true,
        message: 'Qualification updated successfully and submitted for review.',
        data: {
          ...restVendor,
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

// Add this to your backend routes
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