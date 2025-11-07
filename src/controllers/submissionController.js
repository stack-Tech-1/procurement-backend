// backend/src/controllers/submissionController.js
import prisma from "../config/prismaClient.js";

/**
 * Create Vendor Submission for RFO
 */
export const createSubmission = async (req, res) => {
  try {
    const {
      rfqId,
      vendorId,
      totalValue,
      currency,
      docUrl,
      items,
      status = "SUBMITTED"
    } = req.body;

    // Check if RFO exists
    const rfq = await prisma.rFQ.findUnique({
      where: { id: parseInt(rfqId) }
    });

    if (!rfq) {
      return res.status(404).json({ error: "RFO not found" });
    }

    // Check if vendor exists
    const vendor = await prisma.vendor.findUnique({
      where: { id: parseInt(vendorId) }
    });

    if (!vendor) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    const submission = await prisma.rFQSubmission.create({
      data: {
        totalValue: totalValue ? parseFloat(totalValue) : null,
        currency: currency || "SAR",
        docUrl,
        items: items || {},
        status: status,
        rfq: { connect: { id: parseInt(rfqId) } },
        vendor: { connect: { id: parseInt(vendorId) } }
      },
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

    res.status(201).json(submission);
  } catch (error) {
    console.error("Error creating submission:", error);
    res.status(500).json({ error: "Failed to create submission" });
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