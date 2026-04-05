import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import prisma from "../../config/prismaClient.js";
import { authenticateToken } from "../../middleware/authMiddleware.js";
import { authorizeRole } from "../../middleware/roleMiddleware.js";
import { cachePublic, TTL } from "../../middleware/cacheMiddleware.js";
import { cache } from "../../services/cacheService.js";

const ADMIN_ROLE = [1]; // Executive = Admin

const BRANDING_DEFAULTS = {
  companyName: "KUN Real Estate",
  tagline: "Building excellence through trusted partnerships.",
  aboutText: "We are a leading developer and investment group in Saudi Arabia.",
  learnMoreUrl: "",
  primaryColor: "#0A1628",
  accentColor: "#B8960A",
  logoUrl: "",
  faviconUrl: "",
  backgroundImage: "",
  statProjects: 0,
  statPartners: 0,
  statYears: 0,
};

const PUBLIC_FIELDS = Object.keys(BRANDING_DEFAULTS);

// Ensure uploads/branding directory exists
const UPLOAD_DIR = "uploads/branding";
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Multer disk storage config
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${file.fieldname}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = [".jpg", ".jpeg", ".png", ".webp", ".svg"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed (jpg, jpeg, png, webp, svg)."));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

// Helper: get settings or defaults
async function getSettings() {
  const settings = await prisma.brandingSettings.findFirst();
  return settings ?? { id: null, ...BRANDING_DEFAULTS };
}

// ─── Admin Router ────────────────────────────────────────────────────────────
const router = express.Router();

// GET /api/admin/branding — public, no auth needed
router.get("/", cachePublic(TTL.VERY_LONG), async (_req, res) => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (error) {
    console.error("❌ Error fetching branding settings:", error);
    res.status(500).json({ error: "Failed to fetch branding settings." });
  }
});

// PUT /api/admin/branding — admin only
router.put("/", authenticateToken, authorizeRole(ADMIN_ROLE), async (req, res) => {
  try {
    const allowed = [
      "companyName", "tagline", "aboutText", "learnMoreUrl",
      "primaryColor", "accentColor", "logoUrl", "faviconUrl",
      "backgroundImage", "statProjects", "statPartners", "statYears",
    ];

    const data = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        data[field] = req.body[field];
      }
    }

    if (req.user?.id) {
      data.updatedById = req.user.id;
    }

    const existing = await prisma.brandingSettings.findFirst();

    const updated = existing
      ? await prisma.brandingSettings.update({ where: { id: existing.id }, data })
      : await prisma.brandingSettings.create({ data: { ...BRANDING_DEFAULTS, ...data } });

    // Invalidate branding cache
    cache.invalidatePrefix('public:/api/admin/branding');
    cache.invalidatePrefix('public:/api/branding');

    res.json(updated);
  } catch (error) {
    console.error("❌ Error updating branding settings:", error);
    res.status(500).json({ error: "Failed to update branding settings." });
  }
});

// POST /api/admin/branding/logo — admin only
router.post("/logo", authenticateToken, authorizeRole(ADMIN_ROLE), (req, res) => {
  upload.single("logo")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const logoUrl = `/${UPLOAD_DIR}/${req.file.filename}`;

    try {
      const existing = await prisma.brandingSettings.findFirst();
      if (existing) {
        await prisma.brandingSettings.update({ where: { id: existing.id }, data: { logoUrl } });
      } else {
        await prisma.brandingSettings.create({ data: { ...BRANDING_DEFAULTS, logoUrl } });
      }
      res.json({ logoUrl });
    } catch (error) {
      console.error("❌ Error saving logo URL:", error);
      res.status(500).json({ error: "Failed to save logo." });
    }
  });
});

// POST /api/admin/branding/favicon — admin only
router.post("/favicon", authenticateToken, authorizeRole(ADMIN_ROLE), (req, res) => {
  upload.single("favicon")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const faviconUrl = `/${UPLOAD_DIR}/${req.file.filename}`;

    try {
      const existing = await prisma.brandingSettings.findFirst();
      if (existing) {
        await prisma.brandingSettings.update({ where: { id: existing.id }, data: { faviconUrl } });
      } else {
        await prisma.brandingSettings.create({ data: { ...BRANDING_DEFAULTS, faviconUrl } });
      }
      res.json({ faviconUrl });
    } catch (error) {
      console.error("❌ Error saving favicon URL:", error);
      res.status(500).json({ error: "Failed to save favicon." });
    }
  });
});

// ─── Public Router ───────────────────────────────────────────────────────────
export const publicBrandingRouter = express.Router();

// GET /api/branding/public
publicBrandingRouter.get("/public", async (_req, res) => {
  try {
    const settings = await getSettings();
    const publicData = {};
    for (const field of PUBLIC_FIELDS) {
      publicData[field] = settings[field];
    }
    res.json(publicData);
  } catch (error) {
    console.error("❌ Error fetching public branding:", error);
    res.status(500).json({ error: "Failed to fetch branding." });
  }
});

export default router;
