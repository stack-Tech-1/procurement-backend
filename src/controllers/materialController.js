import pkg from "@prisma/client";
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

// Get all materials
export const getMaterials = async (req, res) => {
  try {
    const materials = await prisma.cSI_Material.findMany({
      include: {
        defaultVendor: true, // include vendor details if available
      },
    });
    res.json(materials);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch materials" });
  }
};

// Create a new material
export const createMaterial = async (req, res) => {
  try {
    const { csiCode, name, unit, defaultVendorId } = req.body;
    const material = await prisma.cSI_Material.create({
      data: {
        csiCode,
        name,
        unit,
        defaultVendorId: defaultVendorId ? parseInt(defaultVendorId) : null,
      },
    });
    res.status(201).json(material);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create material" });
  }
};

// Get single material by ID
export const getMaterialById = async (req, res) => {
  try {
    const { id } = req.params;
    const material = await prisma.cSI_Material.findUnique({
      where: { id: parseInt(id) },
      include: { defaultVendor: true },
    });
    if (!material) {
      return res.status(404).json({ error: "Material not found" });
    }
    res.json(material);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch material" });
  }
};

// Update material
export const updateMaterial = async (req, res) => {
  try {
    const { id } = req.params;
    const { csiCode, name, unit, defaultVendorId } = req.body;

    const updated = await prisma.cSI_Material.update({
      where: { id: parseInt(id) },
      data: {
        csiCode,
        name,
        unit,
        defaultVendorId: defaultVendorId ? parseInt(defaultVendorId) : null,
      },
    });
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update material" });
  }
};

// Delete material
export const deleteMaterial = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.cSI_Material.delete({
      where: { id: parseInt(id) },
    });
    res.json({ message: "Material deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete material" });
  }
};
