import prisma from "../config/prismaClient.js";

/**
 * Submit IPC
 */
export const submitIPC = async (req, res) => {
  try {
    const { contractId, amount, description, submittedById } = req.body;

    const ipc = await prisma.ipc.create({
      data: {
        contractId,
        amount,
        description,
        submittedById,
        status: "PENDING",
      },
    });

    res.status(201).json(ipc);
  } catch (error) {
    console.error("Error submitting IPC:", error);
    res.status(500).json({ error: "Failed to submit IPC" });
  }
};

/**
 * Get all IPCs
 */
export const getIPCs = async (req, res) => {
  try {
    const ipcs = await prisma.ipc.findMany({
      include: { contract: true, submittedBy: true },
      orderBy: { createdAt: "desc" },
    });

    res.json(ipcs);
  } catch (error) {
    console.error("Error fetching IPCs:", error);
    res.status(500).json({ error: "Failed to fetch IPCs" });
  }
};

/**
 * Approve or Reject IPC
 */
export const updateIPCStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // "APPROVED" or "REJECTED"

    const updated = await prisma.ipc.update({
      where: { id: Number(id) },
      data: { status },
    });

    res.json(updated);
  } catch (error) {
    console.error("Error updating IPC:", error);
    res.status(500).json({ error: "Failed to update IPC status" });
  }
};
