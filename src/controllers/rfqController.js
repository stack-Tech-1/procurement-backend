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
    
    console.log('🔍 Fetching RFQ details for ID:', id);

    // Validate ID
    if (!id || isNaN(Number(id))) {
      return res.status(400).json({ error: "Invalid RFQ ID" });
    }

    const rfq = await prisma.rFQ.findUnique({
      where: { id: Number(id) },
      include: {
        submissions: {
          include: { 
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
          },
        },
        createdBy: { select: { id: true, email: true, name: true } },
        attachments: true
      },
    });

    if (!rfq) {
      console.log('❌ RFQ not found for ID:', id);
      return res.status(404).json({ error: "RFQ not found" });
    }

    console.log('✅ RFQ found:', rfq.id);
    res.json(rfq);

  } catch (error) {
    console.error("❌ Error fetching RFQ:", error);
    
    // Handle specific Prisma errors
    if (error.code === 'P2025') {
      return res.status(404).json({ error: "RFQ not found" });
    }
    
    res.status(500).json({ 
      error: "Failed to fetch RFQ",
      details: error.message 
    });
  }
};

/**
 * Update RFQ
 */
export const updateRFQ = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    console.log('🔄 Update RFQ Request:', { id, data, user: req.user });

    // Check if RFQ exists first
    const existingRFQ = await prisma.rFQ.findUnique({
      where: { id: Number(id) }
    });

    if (!existingRFQ) {
      return res.status(404).json({ error: "RFQ not found" });
    }

    // Prepare update data
    const updateData = {
      ...data,
      updatedAt: new Date()
    };

    // Handle date fields properly
    if (data.requiredDate) updateData.requiredDate = new Date(data.requiredDate);
    if (data.targetSubmissionDate) updateData.targetSubmissionDate = new Date(data.targetSubmissionDate);
    if (data.dueDate) updateData.dueDate = new Date(data.dueDate);

    const updated = await prisma.rFQ.update({
      where: { id: Number(id) },
      data: updateData,
      include: {
        createdBy: { select: { id: true, email: true, name: true } },
        submissions: {
          include: {
            vendor: true,
            evaluations: true
          }
        }
      }
    });

    console.log('✅ RFQ updated successfully');
    res.json(updated);

  } catch (error) {
    console.error("❌ Error updating RFQ:", error);
    
    // Handle specific Prisma errors
    if (error.code === 'P2025') {
      return res.status(404).json({ error: "RFQ not found" });
    }
    if (error.code === 'P2002') {
      return res.status(400).json({ error: "Unique constraint violation - RFQ number already exists" });
    }
    
    res.status(500).json({ 
      error: "Failed to update RFQ",
      details: error.message 
    });
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
