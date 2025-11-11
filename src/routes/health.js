// backend/src/routes/health.js
import express from 'express';
import { healthController } from '../controllers/healthController.js';

const router = express.Router();

router.get('/', healthController.healthCheck);
router.get('/deep', healthController.deepHealthCheck);

export default router;