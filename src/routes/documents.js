import express from 'express';
import { DocumentController } from '../controllers/documentController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import multer from 'multer';

const router = express.Router();
const documentController = new DocumentController();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Apply authentication to all routes
router.use(authenticateToken);

// Document routes
router.post('/upload-file', upload.single('file'), documentController.uploadFile.bind(documentController));
router.post('/', documentController.uploadDocument.bind(documentController));
router.get('/search', documentController.searchDocuments.bind(documentController));
router.put('/bulk', documentController.bulkUpdate.bind(documentController));
router.post('/approve', documentController.initiateApproval.bind(documentController));

// Document-specific routes
router.get('/:id', documentController.getDocument.bind(documentController));
router.get('/:id/history', documentController.getDocumentHistory.bind(documentController));

export default router;