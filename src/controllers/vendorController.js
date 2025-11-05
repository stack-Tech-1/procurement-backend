import prisma from "../config/prismaClient.js";
import { supabaseAdmin } from '../lib/supabaseAdmin.js'; 

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'vendor-documents';


/**
 * Get vendor details for Admin/Procurement view
 * GET /api/vendors/:id
 */
export const getVendorDetails = async (req, res) => {
  const { id } = req.params;
  
  // Authorization check (Ensure only Procurement/Admin/Vendor can access their own)
  // ... (Your existing authorization logic)

  try {
      const vendor = await prisma.vendor.findUnique({
          where: { id: parseInt(id) },
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
                              csiCode: true,
                              description: true,
                          }
                      }
                  }
              },
              // ✅ NEW: Include Reviewer Info
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
              // ... other relations you need
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



/**
* Get the full Qualification details for the currently authenticated Vendor user.
* GET /api/vendors/qualification/me
*/
export const getMyQualificationDetails = async (req, res) => {
  // 1. Ensure the user is a Vendor (roleId=3, based on your seed)
  if (req.user?.roleId !== 3) {
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