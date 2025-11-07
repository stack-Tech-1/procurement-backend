// backend/src/controllers/contractController.js
import prisma from "../config/prismaClient.js";

/**
 * Create Contract
 */
export const createContract = async (req, res) => {
  try {
    const {
      contractNumber,
      rfqId,
      vendorId,
      contractValue,
      currency,
      startDate,
      endDate,
      status = "DRAFT",
      description,
      contractType,
      paymentTerms,
      warrantyPeriod,
      terminationClause
    } = req.body;

    // Check if vendor exists
    const vendor = await prisma.vendor.findUnique({
      where: { id: parseInt(vendorId) }
    });

    if (!vendor) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    // Check if RFQ exists (if provided)
    if (rfqId) {
      const rfq = await prisma.rFQ.findUnique({
        where: { id: parseInt(rfqId) }
      });
      if (!rfq) {
        return res.status(404).json({ error: "RFQ not found" });
      }
    }

    const contract = await prisma.contract.create({
      data: {
        contractNumber,
        contractValue: parseFloat(contractValue),
        currency: currency || "SAR",
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        status,
        description,
        contractType,
        paymentTerms,
        warrantyPeriod: warrantyPeriod ? parseInt(warrantyPeriod) : null,
        terminationClause,
        ...(rfqId && { rfq: { connect: { id: parseInt(rfqId) } } }),
        vendor: { connect: { id: parseInt(vendorId) } }
      },
      include: {
        rfq: true,
        vendor: true,
        ipcs: true,
        variationOrders: true,
        documents: true
      }
    });

    res.status(201).json(contract);
  } catch (error) {
    console.error("Error creating contract:", error);
    res.status(500).json({ error: "Failed to create contract" });
  }
};

/**
 * Get all contracts with filtering
 */
export const getContracts = async (req, res) => {
  try {
    const { status, vendorId, project } = req.query;
    
    const where = {};
    if (status) where.status = status;
    if (vendorId) where.vendorId = parseInt(vendorId);
    if (project) where.rfq = { projectName: { contains: project, mode: 'insensitive' } };

    const contracts = await prisma.contract.findMany({
      where,
      include: {
        rfq: { select: { id: true, projectName: true, rfqNumber: true } },
        vendor: { select: { id: true, companyLegalName: true, vendorId: true } },
        ipcs: {
          select: {
            id: true,
            ipcNumber: true,
            currentValue: true,
            status: true,
            periodFrom: true,
            periodTo: true
          }
        },
        variationOrders: true,
        documents: true
      },
      orderBy: { createdAt: "desc" }
    });

    res.json(contracts);
  } catch (error) {
    console.error("Error fetching contracts:", error);
    res.status(500).json({ error: "Failed to fetch contracts" });
  }
};

/**
 * Get single contract by ID
 */
export const getContractById = async (req, res) => {
  try {
    const { id } = req.params;

    const contract = await prisma.contract.findUnique({
      where: { id: parseInt(id) },
      include: {
        rfq: true,
        vendor: true,
        ipcs: {
          include: {
            submittedBy: { select: { id: true, name: true, email: true } },
            attachments: true
          },
          orderBy: { createdAt: "desc" }
        },
        variationOrders: {
          orderBy: { createdAt: "desc" }
        },
        documents: {
          include: {
            uploadedBy: { select: { id: true, name: true, email: true } }
          }
        }
      }
    });

    if (!contract) {
      return res.status(404).json({ error: "Contract not found" });
    }

    res.json(contract);
  } catch (error) {
    console.error("Error fetching contract:", error);
    res.status(500).json({ error: "Failed to fetch contract" });
  }
};

/**
 * Update contract
 */
export const updateContract = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const updated = await prisma.contract.update({
      where: { id: parseInt(id) },
      data: {
        ...data,
        updatedAt: new Date()
      },
      include: {
        rfq: true,
        vendor: true,
        ipcs: true,
        variationOrders: true
      }
    });

    res.json(updated);
  } catch (error) {
    console.error("Error updating contract:", error);
    res.status(500).json({ error: "Failed to update contract" });
  }
};

/**
 * Delete contract
 */
export const deleteContract = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.contract.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: "Contract deleted successfully" });
  } catch (error) {
    console.error("Error deleting contract:", error);
    res.status(500).json({ error: "Failed to delete contract" });
  }
};