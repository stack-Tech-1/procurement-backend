import express from "express";
import {
  getMaterials,
  createMaterial,
  getMaterialById,
  updateMaterial,
  deleteMaterial,
} from "../controllers/materialController.js";

const router = express.Router();

router.get("/", getMaterials);
router.post("/", createMaterial);
router.get("/:id", getMaterialById);
router.put("/:id", updateMaterial);
router.delete("/:id", deleteMaterial);

export default router;