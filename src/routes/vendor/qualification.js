import express from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken } from "../../middleware/authMiddleware.js";
import multer from "multer";
import { uploadToS3, generatePresignedUrl, getPublicUrl } from '../../lib/awsS3.js';

const router = express.Router();
const prisma = new PrismaClient();

// Configure Multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// --- Utility Function to Upload a File to AWS S3 ---
const uploadFileToS3 = async (file, folder, vendorId) => {
  try {
    // Upload to S3
    const key = await uploadToS3(
      file.buffer,
      file.originalname,
      file.mimetype,
      folder,
      vendorId
    );
    
    // Return S3 key for storage in database
    return key;
  } catch (error) {
    console.error("S3 Upload Error:", error);
    throw new Error(`Failed to upload file to S3: ${error.message}`);
  }
};

// --- Helper to ensure data is in correct format for Prisma ---
const getExpiryDate = (dateString) => {
  if (!dateString) return null;
  const date = new Date(dateString); 
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
  upload.any(), // Handle all file fields
  async (req, res) => {
    try {
      console.log("📁 Files received:", req.files?.length || 0);
      
      const vendorDataJson = req.body.vendorData;
      if (!vendorDataJson) {
        return res.status(400).json({ error: "Missing vendorData JSON payload." });
      }

      const data = JSON.parse(vendorDataJson);
      const { 
        documentData: docMetadata = [], 
        projectExperience: projectData = [], 
        ...qualificationDetails 
      } = data;
      
      // Convert productsAndServices string to array
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

      const uploadedFiles = req.files || [];
      const uploadedDocuments = [];
      const uploadedProjects = [];

      console.log(`🔄 Processing files for vendor ID: ${vendor.id}`);

      // 1. Handle Company Profile PDF
      const companyProfileFile = uploadedFiles.find(f => f.fieldname === 'company_profile_pdf');
      if (companyProfileFile) {
        console.log("📄 Uploading company profile...");
        const s3Key = await uploadFileToS3(companyProfileFile, 'profiles', vendor.id);
        
        uploadedDocuments.push({
          vendorId: vendor.id,
          storagePath: s3Key, // Store S3 key
          docType: 'COMPANY_PROFILE',
          documentNumber: null,
          expiryDate: null,
          fileName: companyProfileFile.originalname,
        });
      }

      // 2. Handle Other Documents
      for (const meta of docMetadata) {
        const fileKey = `file_${meta.docType}`;
        const file = uploadedFiles.find(f => f.fieldname === fileKey);

        if (file) {
          console.log(`📄 Uploading ${meta.docType}...`);
          const s3Key = await uploadFileToS3(file, 'documents', vendor.id);
          
          uploadedDocuments.push({
            vendorId: vendor.id,
            storagePath: s3Key,
            docType: meta.docType,
            fileName: file.originalname,
            documentNumber: meta.documentNumber || null,
            expiryDate: getExpiryDate(meta.expiryDate),
            isoType: meta.isoType || null,
          });
        }
      }

      // 3. Handle Project Experience files
      for (let i = 0; i < projectData.length; i++) {
        const project = projectData[i];
        const fileKey = `project_file_${i}`;
        const file = uploadedFiles.find(f => f.fieldname === fileKey);
        
        let certificateS3Key = null;
        if (file) {
          console.log(`📄 Uploading project certificate ${i}...`);
          certificateS3Key = await uploadFileToS3(file, 'project-certificates', vendor.id);
        }
        
        uploadedProjects.push({
          ...project,
          vendorId: vendor.id,
          contractValue: parseFloat(project.contractValue) || 0,
          startDate: getExpiryDate(project.startDate),
          endDate: getExpiryDate(project.endDate),
          completionCertificateStoragePath: certificateS3Key,
        });
      }

      // 4. Prisma Transaction
const result = await prisma.$transaction(async (tx) => {
  
  // Prepare logo URL if it exists
  let logoToUpdate = {};
  
  // Handle logo from different sources:
  if (qualificationDetails.logoUrl) {
    // Logo URL from form data
    logoToUpdate.logo = qualificationDetails.logoUrl;
  } else if (logoPreview) {
    // Logo preview URL (if you're using blob URL)
    logoToUpdate.logo = logoPreview;
  } else {
    // Check if logo file was uploaded separately
    const logoFile = uploadedFiles.find(f => f.fieldname === 'companyLogo');
    if (logoFile) {
      try {
        console.log('📷 Processing logo file upload...');
        const logoKey = await uploadFileToS3(logoFile, 'logos', vendor.id);
        const logoUrl = getPublicUrl(logoKey); // Or generatePresignedUrl for private
        logoToUpdate.logo = logoUrl;
        console.log('✅ Logo uploaded to S3:', logoUrl);
      } catch (logoError) {
        console.error('❌ Error uploading logo:', logoError);
        // Continue without logo, don't fail the whole submission
      }
    }
  }

  // 4.1 UPDATE THE VENDOR RECORD
  const updatedVendor = await tx.vendor.update({
    where: { id: vendor.id }, 
    data: { 
      // Basic company info
      companyLegalName: qualificationDetails.companyLegalName || null,
      vendorType: qualificationDetails.vendorType || null,
      businessType: qualificationDetails.businessType || null,
      licenseNumber: qualificationDetails.licenseNumber || null,
      
      // Business details
      yearsInBusiness: parseInt(qualificationDetails.yearsInBusiness) || 0,
      gosiEmployeeCount: parseInt(qualificationDetails.gosiEmployeeCount) || 0,
      chamberClass: qualificationDetails.chamberClass || null,
      chamberRegion: qualificationDetails.chamberRegion || null,
      
      // Categories and specialization
      mainCategory: Array.isArray(qualificationDetails.mainCategory) 
        ? qualificationDetails.mainCategory 
        : (qualificationDetails.mainCategory ? [qualificationDetails.mainCategory] : []),
      subCategory: qualificationDetails.subCategory || null,
      productsAndServices: Array.isArray(qualificationDetails.productsAndServices) 
        ? qualificationDetails.productsAndServices 
        : (qualificationDetails.productsAndServices ? [qualificationDetails.productsAndServices] : []),
      csiSpecialization: qualificationDetails.csiSpecialization || null,
      
      // Contact information
      contactPerson: qualificationDetails.contactPerson || null,
      contactPhone: qualificationDetails.contactPhone || null,
      contactEmail: qualificationDetails.contactEmail || null,
      website: qualificationDetails.website || null,
      addressStreet: qualificationDetails.addressStreet || null,
      addressCity: qualificationDetails.addressCity || null,
      addressRegion: qualificationDetails.addressRegion || null,
      addressCountry: qualificationDetails.addressCountry || null,
      
      // Primary contact fields
      primaryContactName: qualificationDetails.primaryContactName || null,
      primaryContactTitle: qualificationDetails.primaryContactTitle || null,
      technicalContactName: qualificationDetails.technicalContactName || null,
      technicalContactEmail: qualificationDetails.technicalContactEmail || null,
      financialContactName: qualificationDetails.financialContactName || null,
      financialContactEmail: qualificationDetails.financialContactEmail || null,
      
      // Logo update (if any)
      ...logoToUpdate,
      
      // Status updates
      status: 'UNDER_REVIEW', 
      reviewStatus: 'Needs Review',
      lastReviewedAt: new Date(),
      updatedAt: new Date(),            
            
            // Remove fields that don't exist in your schema:
            // ❌ Don't include: majorBrands, authorizationLevel, authLettersAvailable,
            //    primaryProductCategories, countryOfOrigin, localManufacturing,
            //    leadConsultantCV, keyTeamMembers, companyResume, similarProjectsCount,
            //    assignmentDetails, clientReferences
          },
        });

        // 4.2 Handle Vendor Documents
        await tx.vendorDocument.deleteMany({ where: { vendorId: vendor.id } });
        if (uploadedDocuments.length > 0) {
          await tx.vendorDocument.createMany({
            data: uploadedDocuments.map(doc => ({
              url: doc.storagePath, // Store S3 key
              documentNumber: doc.documentNumber,
              expiryDate: doc.expiryDate,
              docType: doc.docType,
              vendorId: doc.vendorId,
              fileName: doc.fileName,
              isoType: doc.isoType,
            }))
          });
        }

        // 4.3 Handle Project Experience
        await tx.vendorProjectExperience.deleteMany({ where: { vendorId: vendor.id } });
        if (uploadedProjects.length > 0) {
          await tx.vendorProjectExperience.createMany({
            data: uploadedProjects.map(p => ({
              ...p,
              completionFile: p.completionCertificateStoragePath,
              completionCertificateStoragePath: undefined,
              startDate: p.startDate,
              endDate: p.endDate
            }))
          });
        }

        return updatedVendor;
      });

      console.log("✅ Vendor qualification submitted successfully");

      res.status(200).json({
        success: true,
        message: "Vendor qualification submitted successfully and is now UNDER REVIEW.",
        data: {
          id: result.id,
          status: result.status
        },
      });

    } catch (error) {
      console.error("❌ Fatal Submission Error:", error);
      res.status(500).json({ 
        success: false,
        error: "Failed to process vendor qualification. Please try again.",
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * GET /api/vendor/documents/:key/url
 * Generate a presigned URL for a document
 */
router.get("/documents/:key/url", authenticateToken, async (req, res) => {
  try {
    const { key } = req.params;
    const userId = req.user?.id;
    
    // Verify the user has access to this document
    const vendor = await prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    // Verify document belongs to vendor
    const document = await prisma.vendorDocument.findFirst({
      where: {
        vendorId: vendor.id,
        url: key,
      },
    });

    if (!document) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Generate presigned URL (valid for 1 hour)
    const signedUrl = await generatePresignedUrl(key, 3600);
    
    if (!signedUrl) {
      return res.status(500).json({ error: "Failed to generate download URL" });
    }

    res.json({ url: signedUrl });
  } catch (error) {
    console.error("Error generating document URL:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;