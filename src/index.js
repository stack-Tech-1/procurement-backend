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
import vendorQualificationRoute from "./routes/vendor/qualification.js";
import adminSubmissionsRouter from './routes/admin/submissions.js';
import adminFilesRouter from './routes/admin/files.js';
import qualificationRoutes from './routes/qualification.routes.js';
import vendorManagementRoute from "./routes/vendor/management.js";
import { startExpiryCheckJob } from "./jobs/expiryCheckJob.js";
import categoryRoutes from './routes/categoryRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import submissionRoutes from "./routes/submissionRoutes.js";

dotenv.config();
const app = express();

app.use(cors({
  origin: ["https://main.dwotf13xzdq3t.amplifyapp.com"], // your frontend's dev URL
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));


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
app.use("/api/vendor/qualification", vendorQualificationRoute);
//app.use('/api/admin/submissions', adminSubmissionsRouter);
app.use('/api/admin/files', adminFilesRouter);
app.use('/api/admin/submissions', qualificationRoutes);
app.use("/api/vendor", vendorManagementRoute);
app.use('/api/categories', categoryRoutes);
app.use('/api/audit', auditRoutes);
app.use("/api/submissions", submissionRoutes);


app.get("/", (req, res) => {
  res.send("Procurement ERP backend is running 🚀");
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Backend is alive 🚀" });
});


const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    
    // 👇 START THE CRON JOB AFTER THE SERVER IS RUNNING
    startExpiryCheckJob(); 
});