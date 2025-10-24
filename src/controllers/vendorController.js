import prisma from "../config/prismaClient.js";
import { supabaseAdmin } from '../lib/supabaseAdmin.js'; 

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'vendor-documents';


export const getVendorDetails = async (req, res) => {
  const { id } = req.params;
  
  // Authorization check (Ensure only Procurement/Admin/Vendor can access their own)
  // ... (Your existing authorization logic)

  try {
      const vendor = await prisma.vendor.findUnique({
          where: { id: parseInt(id) },
          include: {
              documents: true, // Include related documents
              projectExperience: true, // Include project experience
              // ... other relations you need
          },
      });

      if (!vendor) {
          return res.status(404).json({ error: 'Vendor not found.' });
      }

      // --- NEW LOGIC: Map Storage Paths to Public URLs ---
      const documentsWithUrls = vendor.documents.map(doc => {
          // Check if the URL is already a full URL (e.g., from an external link)
          const isFullUrl = doc.url.startsWith('http');
          
          let publicUrl = doc.url;
          if (!isFullUrl) {
              // If it's a storage path, generate the public URL
              const { data } = supabaseAdmin.storage
                  .from(STORAGE_BUCKET)
                  .getPublicUrl(doc.url); // doc.url contains the storage path

              publicUrl = data?.publicUrl || doc.url; // Fallback to path if generation fails
          }

          return {
              ...doc,
              // Replace the storage path in the 'url' field with the public URL
              url: publicUrl, 
          };
      });

      const projectsWithUrls = vendor.projectExperience.map(project => {
          let completionFileUrl = project.completionFile;
          
          if (project.completionFile && !project.completionFile.startsWith('http')) {
              // completionFile contains the storage path
              const { data } = supabaseAdmin.storage
                  .from(STORAGE_BUCKET)
                  .getPublicUrl(project.completionFile);
                  
              completionFileUrl = data?.publicUrl || project.completionFile;
          }

          return {
              ...project,
              completionFile: completionFileUrl,
          };
      });
      // --- END NEW LOGIC ---

      res.json({ 
          ...vendor,
          documents: documentsWithUrls,
          projectExperience: projectsWithUrls,
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
      },
  });

  if (!vendor) {
      // This should not happen if registration worked, but good safeguard
      return res.status(404).json({ error: 'Vendor profile not found for this user.' });
  }

  try {
      // 3. Apply the same logic as getVendorDetails to convert storage paths to public URLs
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

      // 4. Return the enhanced vendor object
      res.json({ 
          ...vendor,
          documents: documentsWithUrls,
          projectExperience: projectsWithUrls,
      });

  } catch (error) {
      console.error('Error fetching vendor qualification:', error);
      res.status(500).json({ error: 'Failed to fetch vendor qualification details.' });
  }
};








/**
 * Create Vendor
 */
export const createVendor = async (req, res) => {
  try {
    const { name, email, contactName, contactPhone, address, country, categoryId } = req.body;

    const existing = await prisma.vendor.findUnique({ where: { contactEmail: email } });
    if (existing) return res.status(400).json({ error: "Email already exists for a vendor." });

    const vendor = await prisma.vendor.create({
      data: {
        name,
        contactEmail: email,
        contactName,
        contactPhone,
        address,
        country,
        categoryId: categoryId ? Number(categoryId) : null,
        status: "NEW",
      },
      include: { category: true },
    });

    res.status(201).json(vendor);
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
    // We assume userId from JWT maps directly to vendor.id
    const vendorId = req.user?.id; 
    if (!vendorId) return res.status(401).json({ error: "Unauthorized" });

    const vendor = await prisma.vendor.findUnique({
      where: { id: Number(vendorId) },
      // Select fields consistent with Vendor model
      select: { id: true, name: true, contactEmail: true, code: true, status: true },
    });

    if (!vendor) return res.status(404).json({ error: "Vendor not found." });
    res.json(vendor);
  } catch (error) {
    console.error("Error fetching vendor:", error);
    res.status(500).json({ error: "Failed to fetch vendor" });
  }
};


/**
 * Get all vendors (Admin)
 */
export const getAllVendors = async (req, res) => {
  try {
    const vendors = await prisma.vendor.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        categories: true, 
      },
    });

    res.json(vendors);
  } catch (error) {
    console.error("Error fetching vendors:", error);
    res.status(500).json({ error: "Failed to fetch vendors" });
  }
};



/**
 * Get vendor by ID (Admin)
 */
export const getVendorById = async (req, res) => {
  try {
    if (req.user?.roleId !== 1)
      return res.status(403).json({ error: "Access denied. Admins only." });

    const { id } = req.params;
    const vendor = await prisma.vendor.findUnique({
      where: { id: Number(id) },
      include: {
        category: true,
        materials: true,
        contracts: true,
        priceEntries: true,
        submissions: true,
        users: true,
        documents: true,
      },
    });

    if (!vendor) return res.status(404).json({ error: "Vendor not found" });
    res.json(vendor);
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
    if (req.user?.roleId !== 1)
      return res.status(403).json({ error: "Access denied" });

    const { id } = req.params;
    const { name, email, status, contactName, contactPhone, address, country, categoryId } = req.body;

    const updated = await prisma.vendor.update({
      where: { id: Number(id) },
      data: {
        name,
        contactEmail: email,
        status,
        contactName,
        contactPhone,
        address,
        country,
        categoryId: categoryId ? Number(categoryId) : null,
      },
      include: { category: true },
    });

    res.json(updated);
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Vendor not found" });
    }
    console.error("Error updating vendor:", error);
    res.status(500).json({ error: "Failed to update vendor" });
  }
};
