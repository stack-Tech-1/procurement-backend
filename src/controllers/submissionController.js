// backend/src/controllers/submissionController.js
import prisma from "../config/prismaClient.js";
import { uploadToS3, generatePresignedUrl } from "../lib/awsS3.js";

/**
 * Create Vendor Submission for RFQ
 */
export const createSubmission = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { 
      rfqId, 
      totalValue, 
      totalAmount,
      currency, 
      items, 
      status = "SUBMITTED" 
    } = req.body;

    // 1. Get vendor by user ID
    const vendor = await prisma.vendor.findUnique({
      where: { userId: parseInt(userId) }
    });
    
    if (!vendor) {
      return res.status(404).json({ error: "Vendor profile not found" });
    }

    // 2. Check if RFQ exists and is open
    const rfq = await prisma.rFQ.findUnique({
      where: { id: parseInt(rfqId) }
    });

    if (!rfq) {
      return res.status(404).json({ error: "RFQ not found" });
    }

    if (rfq.status !== "OPEN" && rfq.status !== "ISSUED") {
      return res.status(400).json({ 
        error: "RFQ is not accepting submissions",
        currentStatus: rfq.status 
      });
    }

    // 3. Check submission deadline
    if (rfq.dueDate && new Date(rfq.dueDate) < new Date()) {
      return res.status(400).json({ 
        error: "Submission deadline has passed" 
      });
    }

    // 4. Check for duplicate submission
    const existingSubmission = await prisma.rFQSubmission.findFirst({
      where: {
        rfqId: parseInt(rfqId),
        vendorId: vendor.id
      }
    });

    if (existingSubmission) {
      return res.status(400).json({ 
        error: "You have already submitted a proposal for this RFQ",
        existingSubmissionId: existingSubmission.id 
      });
    }

    // 5. Handle file upload (if using FormData/multer)
    let docUrl = null;
    let docKey = null;
    if (req.file) {
      const file = req.file;
      docKey = await uploadToS3(
        file.buffer,
        file.originalname,
        file.mimetype,
        "submissions",
        `rfq-${rfqId}`
      );
      docUrl = await generatePresignedUrl(docKey, 3600); // 1 hour access
    }

    // 6. Create submission
    const submission = await prisma.rFQSubmission.create({
      data: {
        totalValue: totalValue ? parseFloat(totalValue) : null,
        totalAmount: totalAmount ? parseFloat(totalAmount) : null,
        currency: currency || "SAR",
        docUrl: docKey || docUrl, // Store S3 key or URL
        items: items || {},
        status: status,
        submittedAt: new Date(),
        rfq: { connect: { id: parseInt(rfqId) } },
        vendor: { connect: { id: vendor.id } }
      },
      include: {
        rfq: {
          select: {
            id: true,
            title: true,
            rfqNumber: true,
            projectName: true,
            status: true,
            dueDate: true
          }
        },
        vendor: {
          select: {
            id: true,
            companyLegalName: true,
            vendorId: true,
            contactEmail: true,
            contactPhone: true
          }
        },
        evaluations: {
          include: {
            evaluator: { select: { id: true, name: true, email: true } }
          }
        }
      }
    });

    // 7. Generate signed URL for the document if stored as S3 key
    if (submission.docUrl && !submission.docUrl.startsWith('http')) {
      submission.docUrl = await generatePresignedUrl(submission.docUrl, 3600);
    }

    res.status(201).json({
      success: true,
      message: "Submission created successfully",
      data: submission
    });

  } catch (error) {
    console.error("Error creating submission:", error);
    
    // Handle specific Prisma errors
    if (error.code === 'P2002') {
      return res.status(400).json({ 
        success: false,
        error: "Duplicate submission detected" 
      });
    }
    
    if (error.code === 'P2025') {
      return res.status(404).json({ 
        success: false,
        error: "Related record not found" 
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: "Failed to create submission",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all submissions with filtering
 */
export const getSubmissions = async (req, res) => {
  try {
    const { rfqId, vendorId, status } = req.query;
    
    const where = {};
    if (rfqId) where.rfqId = parseInt(rfqId);
    if (vendorId) where.vendorId = parseInt(vendorId);
    if (status) where.status = status;

    const submissions = await prisma.rFQSubmission.findMany({
      where,
      include: {
        rfq: { select: { id: true, title: true, rfqNumber: true, projectName: true } },
        vendor: { 
          select: { 
            id: true, 
            companyLegalName: true, 
            vendorId: true,
            contactEmail: true,
            contactPhone: true
          } 
        },
        evaluations: {
          include: {
            evaluator: { select: { id: true, name: true, email: true } }
          },
          orderBy: { createdAt: "desc" }
        }
      },
      orderBy: { submittedAt: "desc" }
    });

    res.json(submissions);
  } catch (error) {
    console.error("Error fetching submissions:", error);
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
};

/**
 * Get single submission by ID
 */
export const getSubmissionById = async (req, res) => {
  try {
    const { id } = req.params;

    const submission = await prisma.rFQSubmission.findUnique({
      where: { id: parseInt(id) },
      include: {
        rfq: true,
        vendor: true,
        evaluations: {
          include: {
            evaluator: { select: { id: true, name: true, email: true } }
          },
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    res.json(submission);
  } catch (error) {
    console.error("Error fetching submission:", error);
    res.status(500).json({ error: "Failed to fetch submission" });
  }
};

/**
 * Update submission
 */
export const updateSubmission = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const updated = await prisma.rFQSubmission.update({
      where: { id: parseInt(id) },
      data,
      include: {
        rfq: true,
        vendor: true,
        evaluations: {
          include: {
            evaluator: { select: { id: true, name: true, email: true } }
          }
        }
      }
    });

    res.json(updated);
  } catch (error) {
    console.error("Error updating submission:", error);
    res.status(500).json({ error: "Failed to update submission" });
  }
};

/**
 * Delete submission
 */
export const deleteSubmission = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.rFQSubmission.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: "Submission deleted successfully" });
  } catch (error) {
    console.error("Error deleting submission:", error);
    res.status(500).json({ error: "Failed to delete submission" });
  }
};

/**
 * Evaluate vendor submission
 */
export const evaluateSubmission = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      technicalScore,
      financialScore,
      experienceScore,
      responsiveness,
      otherScore,
      totalScore,
      comments,
      evaluatorId
    } = req.body;

    // Create evaluation
    const evaluation = await prisma.evaluation.create({
      data: {
        technicalScore: technicalScore ? parseFloat(technicalScore) : null,
        financialScore: financialScore ? parseFloat(financialScore) : null,
        experienceScore: experienceScore ? parseFloat(experienceScore) : null,
        responsiveness: responsiveness ? parseFloat(responsiveness) : null,
        otherScore: otherScore ? parseFloat(otherScore) : null,
        totalScore: totalScore ? parseFloat(totalScore) : null,
        comments,
        submission: { connect: { id: parseInt(id) } },
        evaluator: { connect: { id: parseInt(evaluatorId) } }
      },
      include: {
        evaluator: { select: { id: true, name: true, email: true } }
      }
    });

    // Calculate recommendation based on scores
    let recommendation = "PENDING";
    if (totalScore >= 80) recommendation = "APPROVE";
    else if (totalScore >= 60) recommendation = "PENDING";
    else recommendation = "REJECT";

    // Update submission status based on recommendation
    let newStatus = "UNDER_REVIEW";
    if (recommendation === "APPROVE") newStatus = "RECOMMENDED";
    if (recommendation === "REJECT") newStatus = "REJECTED";

    await prisma.rFQSubmission.update({
      where: { id: parseInt(id) },
      data: { status: newStatus }
    });

    res.json({
      ...evaluation,
      recommendation
    });
  } catch (error) {
    console.error("Error evaluating submission:", error);
    res.status(500).json({ error: "Failed to evaluate submission" });
  }
};