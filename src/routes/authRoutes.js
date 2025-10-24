import express from "express";
import { register, login } from "../controllers/authController.js";
import { getPendingUsers, approveUser } from "../controllers/authController.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/pending", getPendingUsers);
router.put("/approve/:id", approveUser);

export default router;




