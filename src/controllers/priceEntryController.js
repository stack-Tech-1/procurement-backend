import prisma from "../config/prismaClient.js";

// Create a new price entry
export const createPriceEntry = async (req, res) => {
  try {
    const { materialId, vendorId, unitPrice, currency, effectiveDate, expiryDate } = req.body;

    const newEntry = await prisma.priceEntry.create({
      data: {
        materialId,
        vendorId,
        unitPrice: parseFloat(unitPrice),
        currency: currency || "NGN",
        effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
      },
    });

    res.json(newEntry);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create price entry" });
  }
};

// Get all price entries
export const getAllPriceEntries = async (req, res) => {
  try {
    const entries = await prisma.priceEntry.findMany({
      include: {
        material: true,
        vendor: true,
      },
    });
    res.json(entries);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch price entries" });
  }
};
