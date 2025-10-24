// backend/src/routes/admin/files.js

import express from 'express';
// Import the new utility function
import { getSignedUrl } from '../../lib/supabaseAdmin.js'; 
import { authenticateToken } from '../../middleware/authMiddleware.js'; 

const router = express.Router();

/**
 * GET /api/admin/files/signed-url
 * Provides a temporary, signed URL for a specific document path.
 * The client will then use this URL to fetch the file.
 * Requires the full storagePath (key) of the file.
 */
router.get(
  '/signed-url', 
  // 💡 Placeholder: Ensure the user is an admin
  authenticateToken, 
  async (req, res) => {
    // The client sends the full path via query parameter
    const filePath = req.query.path; 

    if (!filePath) {
      return res.status(400).json({ error: 'Missing required file path parameter.' });
    }

    try {
      // Generate the URL, valid for 60 seconds
      const signedUrl = await getSignedUrl(filePath, 60); 

      if (!signedUrl) {
        return res.status(500).json({ error: 'Failed to generate signed URL. File may not exist.' });
      }

      // Send the temporary URL back to the client
      res.status(200).json({ signedUrl });
      
    } catch (error) {
      console.error('Error in signed URL endpoint:', error);
      res.status(500).json({ error: 'Server error during file access.' });
    }
  }
);

export default router;