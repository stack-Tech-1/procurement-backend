import prisma from "../config/prismaClient.js";

/**
 * Create a Contract
 */
export const createContract = async (req, res) => {
  try {
    const { title, vendorId, rfqId, amount, currency, dueDate } = req.body;

    const contract = await prisma.contract.create({
      data: {
        title,
        vendorId,
        rfqId,
        amount,
        currency,
        dueDate: dueDate ? new Date(dueDate) : null,
      },
    });

    res.status(201).json(contract);
  } catch (error) {
    console.error("Error creating contract:", error);
    res.status(500).json({ error: "Failed to create contract" });
  }
};

/**
 * Get all contracts
 */
export const getContracts = async (req, res) => {
  try {
    const contracts = await prisma.contract.findMany({
      include: { vendor: true, rfq: true },
      orderBy: { createdAt: "desc" },
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
      where: { id: Number(id) },
      include: { vendor: true, rfq: true },
    });

    if (!contract) return res.status(404).json({ error: "Contract not found" });
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
      where: { id: Number(id) },
      data,
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

    await prisma.contract.delete({ where: { id: Number(id) } });
    res.json({ message: "Contract deleted successfully" });
  } catch (error) {
    console.error("Error deleting contract:", error);
    res.status(500).json({ error: "Failed to delete contract" });
  }
};
