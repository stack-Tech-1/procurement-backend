import express from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken } from "../../middleware/authMiddleware.js";
import multer from "multer";
import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
// NOTE: Assuming SUPABASE_STORAGE_BUCKET is available via process.env

const router = express.Router();
const prisma = new PrismaClient();

// Configure Multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Retrieve the bucket name from environment variables
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'vendor-documents'; 
// Fallback is 'vendor-documents', ensure you create this bucket or set the env var.


// --- Utility Function to Upload a File to Supabase Storage ---
const uploadFileToSupabase = async (file, folder, vendorId) => {
  // Use a unique path: folder/vendor-[ID]/timestamp-filename
  const fileKey = `${folder}/vendor-${vendorId}/${Date.now()}-${file.originalname.replace(/\s/g, '_')}`;
  
  // Use the imported supabaseAdmin client
  const { data, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(fileKey, file.buffer, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.mimetype,
    });

  if (error) {
    console.error("Supabase Upload Error:", error);
    // Attempt to log more detail if possible
    throw new Error(`Failed to upload file to Supabase Storage: ${error.message}`);
  }
  
  // Return the full file path/key for storage in the database
  return data.path; 
};


// --- Helper to ensure data is in correct format for Prisma ---
const getExpiryDate = (dateString) => {
    // Check for falsy values (null, undefined, empty string)
    if (!dateString) return null;
    
    // Attempt to convert the date string into a Date object
    const date = new Date(dateString); 
    
    // If the conversion results in an Invalid Date, return null instead of the invalid date
    if (isNaN(date)) return null; 
    
    return date;
};

/**
 * POST /api/vendor/qualification/submit
 * Handles complex FormData (JSON payload + multiple file uploads)
 */
router.post(
  "/submit",
  authenticateToken,
  // 1. Multer Middleware
  upload.any(), 
  async (req, res) => {
    try {
      const vendorDataJson = req.body.vendorData;
      if (!vendorDataJson) {
        return res.status(400).json({ error: "Missing vendorData JSON payload." });
      }

      const data = JSON.parse(vendorDataJson);
      const { 
        documentData: docMetadata, 
        projectExperience: projectData, 
        ...qualificationDetails 
      } = data;
      
      // FIX 1: Convert productsAndServices STRING TO ARRAY (from previous fix)
      if (qualificationDetails.productsAndServices && typeof qualificationDetails.productsAndServices === 'string') {
          qualificationDetails.productsAndServices = qualificationDetails.productsAndServices
              .split(',')
              .map(s => s.trim())
              .filter(s => s.length > 0);
      }
      
      const userId = req.user?.id;
      const vendor = await prisma.vendor.findUnique({ where: { userId } });

      if (!vendor) {
        return res.status(400).json({ error: "Vendor profile not found." });
      }

      const uploadedFiles = req.files;
      const uploadedDocuments = [];
      const uploadedProjects = [];

      // 1. Handle Company Profile PDF
      let companyProfilePath = null;
      const companyProfileFile = uploadedFiles.find(f => f.fieldname === 'company_profile_pdf');
      
      if (companyProfileFile) {
        companyProfilePath = await uploadFileToSupabase(companyProfileFile, 'profiles', vendor.id); 
        
        // Add the Company Profile as a Document entry
        uploadedDocuments.push({
          vendorId: vendor.id,
          storagePath: companyProfilePath,
          docType: 'COMPANY_PROFILE',
          documentNumber: null,
          expiryDate: null, // 👈 Ensures null is used for nullable date field
          fileName: companyProfileFile.originalname,
        });
      }


      // 2. Handle Other Documents
      for (const meta of docMetadata) {
        const fileKey = `file_${meta.docType}`;
        const file = uploadedFiles.find(f => f.fieldname === fileKey);

        if (file) {
          const storagePath = await uploadFileToSupabase(file, 'documents', vendor.id); 
          
          // FIX 2: Explicitly map fields and use getExpiryDate/null to clean data for Prisma
          uploadedDocuments.push({
            vendorId: vendor.id,
            storagePath, 
            docType: meta.docType,
            fileName: file.originalname,
            documentNumber: meta.documentNumber || null, // Convert falsy (undefined/empty string) to null
            expiryDate: getExpiryDate(meta.expiryDate), // Convert string date to Date object, or null
          });
        }
      }

      // 3. Handle Project Experience
      for (let i = 0; i < projectData.length; i++) {
        const project = projectData[i];
        const fileKey = `project_file_${i}`;
        const file = uploadedFiles.find(f => f.fieldname === fileKey);
        
        let certificateStoragePath = null;
        if (file) {
          const folderName = 'project-certificates';
          certificateStoragePath = await uploadFileToSupabase(file, folderName, vendor.id);
        }
        
        // FIX 3: Convert date strings to Date objects for Project Experience dates
        uploadedProjects.push({
          ...project,
          vendorId: vendor.id,
          contractValue: parseFloat(project.contractValue),
          startDate: getExpiryDate(project.startDate), // Reuse helper for start date
          endDate: getExpiryDate(project.endDate),     // Reuse helper for end date
          completionCertificateStoragePath: certificateStoragePath, 
        });
      }

      // 4. Prisma Transaction
      const result = await prisma.$transaction(async (tx) => {
        
        // 4.1 UPDATE THE VENDOR RECORD
        const updatedVendor = await tx.vendor.update({
          where: { id: vendor.id }, 
          data: { 
            ...qualificationDetails, 
            status: 'UNDER_REVIEW', 
            updatedAt: new Date(),
          },
        });

        // 4.2 Handle Vendor Documents
        await tx.vendorDocument.deleteMany({ where: { vendorId: vendor.id } });
        await tx.vendorDocument.createMany({ 
          data: uploadedDocuments.map(doc => ({
            url: doc.storagePath, 
            documentNumber: doc.documentNumber, 
            expiryDate: doc.expiryDate, // This is now a Date object or null
            docType: doc.docType, 
            vendorId: doc.vendorId,
            fileName: doc.fileName,
          })) 
        });

        // 4.3 Handle Project Experience
        await tx.vendorProjectExperience.deleteMany({ where: { vendorId: vendor.id } });
        await tx.vendorProjectExperience.createMany({ 
          data: uploadedProjects.map(p => ({
            ...p, 
            // Fix: Map the corrected dates and file path to schema fields
            completionFile: p.completionCertificateStoragePath,
            // Remove transient properties 
            completionCertificateStoragePath: undefined, 
            startDate: p.startDate,
            endDate: p.endDate
          })) 
        });

        return updatedVendor; 
      });

      res.status(200).json({
        message: "Vendor qualification submitted successfully and is now UNDER REVIEW.",
        qualification: result,
      });

    } catch (error) {
      console.error("❌ Fatal Submission Error:", error);
      res.status(500).json({ error: "Failed to process vendor qualification. Please try again." });
    }
  }
);

export default router;