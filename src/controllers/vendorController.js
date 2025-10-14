import prisma from "../config/prismaClient.js";

/**
 * Create Vendor
 */
export const createVendor = async (req, res) => {
  try {
    const { name, email, contactName, contactPhone, address, country, categoryId } = req.body;

    const existing = await prisma.vendor.findUnique({ where: { contactEmail: email } });
    if (existing) return res.status(400).json({ error: "Email already exists for a vendor." });

    const vendor = await prisma.vendor.create({
      data: {
        name,
        contactEmail: email,
        contactName,
        contactPhone,
        address,
        country,
        categoryId: categoryId ? Number(categoryId) : null,
        status: "NEW",
      },
      include: { category: true },
    });

    res.status(201).json(vendor);
  } catch (error) {
    console.error("Error creating vendor:", error);
    res.status(500).json({ error: "Failed to create vendor" });
  }
};

/**
 * Get Vendor Profile (Vendor looking up their own profile)
 */
export const getVendor = async (req, res) => {
  try {
    // We assume userId from JWT maps directly to vendor.id
    const vendorId = req.user?.id; 
    if (!vendorId) return res.status(401).json({ error: "Unauthorized" });

    const vendor = await prisma.vendor.findUnique({
      where: { id: Number(vendorId) },
      // Select fields consistent with Vendor model
      select: { id: true, name: true, contactEmail: true, code: true, status: true },
    });

    if (!vendor) return res.status(404).json({ error: "Vendor not found." });
    res.json(vendor);
  } catch (error) {
    console.error("Error fetching vendor:", error);
    res.status(500).json({ error: "Failed to fetch vendor" });
  }
};


/**
 * Get all vendors (Admin)
 */
export const getAllVendors = async (req, res) => {
  try {
    const vendors = await prisma.vendor.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        categories: true, 
      },
    });

    res.json(vendors);
  } catch (error) {
    console.error("Error fetching vendors:", error);
    res.status(500).json({ error: "Failed to fetch vendors" });
  }
};



/**
 * Get vendor by ID (Admin)
 */
export const getVendorById = async (req, res) => {
  try {
    if (req.user?.roleId !== 1)
      return res.status(403).json({ error: "Access denied. Admins only." });

    const { id } = req.params;
    const vendor = await prisma.vendor.findUnique({
      where: { id: Number(id) },
      include: {
        category: true,
        materials: true,
        contracts: true,
        priceEntries: true,
        submissions: true,
        users: true,
        documents: true,
      },
    });

    if (!vendor) return res.status(404).json({ error: "Vendor not found" });
    res.json(vendor);
  } catch (error) {
    console.error("Error fetching vendor by ID:", error);
    res.status(500).json({ error: "Failed to fetch vendor details" });
  }
};

/**
 * Admin Update Vendor
 */
export const adminUpdateVendor = async (req, res) => {
  try {
    if (req.user?.roleId !== 1)
      return res.status(403).json({ error: "Access denied" });

    const { id } = req.params;
    const { name, email, status, contactName, contactPhone, address, country, categoryId } = req.body;

    const updated = await prisma.vendor.update({
      where: { id: Number(id) },
      data: {
        name,
        contactEmail: email,
        status,
        contactName,
        contactPhone,
        address,
        country,
        categoryId: categoryId ? Number(categoryId) : null,
      },
      include: { category: true },
    });

    res.json(updated);
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Vendor not found" });
    }
    console.error("Error updating vendor:", error);
    res.status(500).json({ error: "Failed to update vendor" });
  }
};
