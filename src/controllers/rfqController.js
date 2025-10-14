import prisma from "../config/prismaClient.js";
/*import prisma from "../prismaClient.js";*/

/**
 * Create RFQ
 */
export const createRFQ = async (req, res) => {
  try {
    const {
      rfqNumber,
      title,
      description,
      projectName,
      packageScope,
      itemDesc,
      csiCode,
      estimatedUnitPrice,
      requiredDate,
      targetSubmissionDate,
      currency,
      createdById,
      dueDate,
    } = req.body;

    // ✅ check if user exists first
    const user = await prisma.user.findUnique({
      where: { id: createdById },
    });

    if (!user) {
      return res.status(400).json({
        error: `User with ID ${createdById} does not exist.`,
      });
    }

    const rfq = await prisma.rFQ.create({
      data: {
        rfqNumber,
        title,
        description,
        projectName,
        packageScope,
        itemDesc,
        csiCode,
        estimatedUnitPrice,
        requiredDate: requiredDate ? new Date(requiredDate) : null,
        targetSubmissionDate: targetSubmissionDate ? new Date(targetSubmissionDate) : null,
        currency,
        dueDate: dueDate ? new Date(dueDate) : null,
        createdBy: { connect: { id: createdById } }, // ✅ connect relation
      },
      include: {
        createdBy: true,
      },
    });

    res.status(201).json(rfq);
  } catch (error) {
    console.error("Error creating RFQ:", error);
    res.status(500).json({ error: "Failed to create RFQ" });
  }
};


/**
 * Get all RFQs
 */
export const getRFQs = async (req, res) => {
  try {
    const rfqs = await prisma.rFQ.findMany({
      include: {
        submissions: true,
        createdBy: { select: { id: true, email: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(rfqs);
  } catch (error) {
    console.error("Error fetching RFQs:", error);
    res.status(500).json({ error: "Failed to fetch RFQs" });
  }
};

/**
 * Get single RFQ by ID
 */
export const getRFQById = async (req, res) => {
  try {
    const { id } = req.params;
    const rfq = await prisma.rFQ.findUnique({
      where: { id: Number(id) },
      include: {
        submissions: {
          include: { vendor: true, evaluations: true },
        },
        createdBy: { select: { id: true, email: true, name: true } },
      },
    });

    if (!rfq) return res.status(404).json({ error: "RFQ not found" });
    res.json(rfq);
  } catch (error) {
    console.error("Error fetching RFQ:", error);
    res.status(500).json({ error: "Failed to fetch RFQ" });
  }
};

/**
 * Update RFQ
 */
export const updateRFQ = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const updated = await prisma.rFQ.update({
      where: { id: Number(id) },
      data,
    });

    res.json(updated);
  } catch (error) {
    console.error("Error updating RFQ:", error);
    res.status(500).json({ error: "Failed to update RFQ" });
  }
};

/**
 * Delete RFQ
 */
export const deleteRFQ = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.rFQ.delete({ where: { id: Number(id) } });
    res.json({ message: "RFQ deleted successfully" });
  } catch (error) {
    console.error("Error deleting RFQ:", error);
    res.status(500).json({ error: "Failed to delete RFQ" });
  }
};
