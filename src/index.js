import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import vendorRoutes from "./routes/vendorRoutes.js";
import materialRoutes from "./routes/materialRoutes.js";
import priceEntryRoutes from "./routes/priceEntryRoutes.js";
import rfqRoutes from "./routes/rfqRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import contractRoutes from "./routes/contractRoutes.js";
import ipcRoutes from "./routes/ipcRoutes.js";
import { authenticateToken } from "./middleware/authMiddleware.js";
import adminRoutes from "./routes/adminRoutes.js";

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);

app.use("/api/vendors", vendorRoutes);
app.use("/api/materials", materialRoutes);
app.use("/api/price-entries", priceEntryRoutes);
app.use("/api/rfqs", rfqRoutes);
app.use("/api/users", userRoutes);
app.use("/api/contracts", contractRoutes);
app.use("/api/ipcs", ipcRoutes);


app.get("/", (req, res) => {
  res.send("Procurement ERP backend is running 🚀");
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));