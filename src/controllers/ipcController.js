// backend/src/controllers/ipcController.js
import prisma from "../config/prismaClient.js";

/**
 * Create IPC
 */
export const createIPC = async (req, res) => {
  try {
    const {
      ipcNumber,
      projectName,
      contractId,
      periodFrom,
      periodTo,
      currentValue,
      cumulativeValue,
      deductions,
      netPayable,
      status = "SUBMITTED",
      submittedById,
      description,
      workDescription
    } = req.body;

    // Check if contract exists
    const contract = await prisma.contract.findUnique({
      where: { id: parseInt(contractId) },
      include: { vendor: true, rfq: true }
    });

    if (!contract) {
      return res.status(404).json({ error: "Contract not found" });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: parseInt(submittedById) }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const ipc = await prisma.iPC.create({
      data: {
        ipcNumber,
        projectName: projectName || contract.rfq?.projectName,
        currentValue: parseFloat(currentValue),
        cumulativeValue: parseFloat(cumulativeValue) || 0,
        deductions: parseFloat(deductions) || 0,
        netPayable: parseFloat(netPayable) || (parseFloat(currentValue) - (parseFloat(deductions) || 0)),
        status,
        periodFrom: periodFrom ? new Date(periodFrom) : null,
        periodTo: periodTo ? new Date(periodTo) : null,
        description,
        workDescription,
        contract: { connect: { id: parseInt(contractId) } },
        submittedBy: { connect: { id: parseInt(submittedById) } }
      },
      include: {
        contract: {
          include: {
            vendor: true,
            rfq: true
          }
        },
        submittedBy: { select: { id: true, name: true, email: true } },
        attachments: true
      }
    });

    res.status(201).json(ipc);
  } catch (error) {
    console.error("Error creating IPC:", error);
    res.status(500).json({ error: "Failed to create IPC" });
  }
};

/**
 * Get all IPCs with filtering
 */
export const getIPCs = async (req, res) => {
  try {
    const { status, contractId, project } = req.query;
    
    const where = {};
    if (status) where.status = status;
    if (contractId) where.contractId = parseInt(contractId);
    if (project) where.projectName = { contains: project, mode: 'insensitive' };

    const ipcs = await prisma.iPC.findMany({
      where,
      include: {
        contract: {
          include: {
            vendor: { select: { id: true, companyLegalName: true, vendorId: true } },
            rfq: { select: { id: true, projectName: true, rfqNumber: true } }
          }
        },
        submittedBy: { select: { id: true, name: true, email: true } },
        attachments: true
      },
      orderBy: { createdAt: "desc" }
    });

    res.json(ipcs);
  } catch (error) {
    console.error("Error fetching IPCs:", error);
    res.status(500).json({ error: "Failed to fetch IPCs" });
  }
};

/**
 * Get single IPC by ID
 */
export const getIPCById = async (req, res) => {
  try {
    const { id } = req.params;

    const ipc = await prisma.iPC.findUnique({
      where: { id: parseInt(id) },
      include: {
        contract: {
          include: {
            vendor: true,
            rfq: true
          }
        },
        submittedBy: { select: { id: true, name: true, email: true } },
        attachments: {
          include: {
            uploadedBy: { select: { id: true, name: true, email: true } }
          }
        }
      }
    });

    if (!ipc) {
      return res.status(404).json({ error: "IPC not found" });
    }

    res.json(ipc);
  } catch (error) {
    console.error("Error fetching IPC:", error);
    res.status(500).json({ error: "Failed to fetch IPC" });
  }
};

/**
 * Update IPC
 */
export const updateIPC = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    // Handle numeric fields
    if (data.currentValue) data.currentValue = parseFloat(data.currentValue);
    if (data.cumulativeValue) data.cumulativeValue = parseFloat(data.cumulativeValue);
    if (data.deductions) data.deductions = parseFloat(data.deductions);
    if (data.netPayable) data.netPayable = parseFloat(data.netPayable);

    const updated = await prisma.iPC.update({
      where: { id: parseInt(id) },
      data,
      include: {
        contract: {
          include: {
            vendor: true,
            rfq: true
          }
        },
        submittedBy: { select: { id: true, name: true, email: true } }
      }
    });

    res.json(updated);
  } catch (error) {
    console.error("Error updating IPC:", error);
    res.status(500).json({ error: "Failed to update IPC" });
  }
};

/**
 * Update IPC status
 */
export const updateIPCStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reviewNotes, reviewedById } = req.body;

    const updated = await prisma.iPC.update({
      where: { id: parseInt(id) },
      data: {
        status,
        reviewNotes,
        ...(reviewedById && { reviewedBy: { connect: { id: parseInt(reviewedById) } } })
      },
      include: {
        contract: {
          include: {
            vendor: true,
            rfq: true
          }
        },
        submittedBy: { select: { id: true, name: true, email: true } }
      }
    });

    res.json(updated);
  } catch (error) {
    console.error("Error updating IPC status:", error);
    res.status(500).json({ error: "Failed to update IPC status" });
  }
};

/**
 * Delete IPC
 */
export const deleteIPC = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.iPC.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: "IPC deleted successfully" });
  } catch (error) {
    console.error("Error deleting IPC:", error);
    res.status(500).json({ error: "Failed to delete IPC" });
  }
};