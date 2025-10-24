// backend/src/routes/admin/submissions.js

import express from 'express';
import { PrismaClient } from '@prisma/client';
// NOTE: Use a separate, secure middleware for ADMIN authentication (e.g., check for a specific 'admin' role)
import { authenticateToken } from '../../middleware/authMiddleware.js'; 

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/admin/submissions
 * Fetches a list of all vendor qualifications for admin review.
 * Includes related vendor info.
 */
router.get(
  '/', 
  // 💡 Placeholder: Ensure you implement an admin role check here 
  // (e.g., authenticateToken, authorizeAdmin)
  authenticateToken, 
  async (req, res) => {
    try {
      // Fetch all qualification records
      const submissions = await prisma.vendorQualification.findMany({
        // Always order by submission date, newest first
        orderBy: { submissionDate: 'desc' }, 
        // Eager load the main Vendor details for display
        include: {
          vendor: {
            select: {
              id: true,
              userId: true,
              companyName: true,
              crNumber: true,
            },
          },
        },
      });

      // Simple transformation to make data cleaner for the frontend
      const submissionList = submissions.map(sub => ({
        id: sub.id,
        vendorId: sub.vendor.id,
        companyName: sub.vendor.companyName,
        crNumber: sub.vendor.crNumber,
        status: sub.status,
        submissionDate: sub.submissionDate,
        // Include other fields needed for the table (e.g., vendorType)
        vendorType: sub.vendorType,
        yearsInBusiness: sub.yearsInBusiness,
      }));

      res.status(200).json(submissionList);
    } catch (error) {
      console.error('Error fetching admin submissions:', error);
      res.status(500).json({ error: 'Failed to retrieve vendor submissions list.' });
    }
  }
);

export default router;