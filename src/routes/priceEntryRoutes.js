import express from "express";
import { createPriceEntry, getAllPriceEntries } from "../controllers/priceEntryController.js";

const router = express.Router();

router.post("/", createPriceEntry);
router.get("/", getAllPriceEntries);

export default router;
