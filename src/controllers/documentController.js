import { DocumentService } from '../services/documentService.js';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

const documentService = new DocumentService();

export class DocumentController {
  
  // Upload document
  async uploadDocument(req, res) {
    try {
      const { uploadedById, ...fileData } = req.body;
      
      const document = await documentService.uploadDocument(
        fileData, 
        uploadedById || req.user.id, 
        req.body
      );
      
      res.status(201).json({
        success: true,
        data: document
      });
    } catch (error) {
      console.error('Upload document error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Get document with signed URL
  async getDocument(req, res) {
    try {
      const { id } = req.params;
      const document = await documentService.getDocumentWithUrl(parseInt(id), req.user.id);
      
      res.json({
        success: true,
        data: document
      });
    } catch (error) {
      console.error('Get document error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Get document history
  async getDocumentHistory(req, res) {
    try {
      const { id } = req.params;
      const history = await documentService.getDocumentHistory(parseInt(id));
      
      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      console.error('Get document history error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Search documents
  async searchDocuments(req, res) {
    try {
      const { page = 1, pageSize = 20, ...filters } = req.query;
      const result = await documentService.searchDocuments(filters, parseInt(page), parseInt(pageSize));
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Search documents error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Bulk operations
  async bulkUpdate(req, res) {
    try {
      const { documentIds, updates } = req.body;
      
      const result = await documentService.bulkUpdateDocuments(documentIds, updates);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Bulk update error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Initiate approval workflow
  async initiateApproval(req, res) {
    try {
      const { documentId, workflowId } = req.body;
      
      const document = await documentService.initiateApproval(
        parseInt(documentId), 
        parseInt(workflowId)
      );
      
      res.json({
        success: true,
        data: document
      });
    } catch (error) {
      console.error('Initiate approval error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Upload file to Supabase
  async uploadFile(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      const { originalname, buffer, mimetype } = req.file;
      const fileName = `${Date.now()}-${originalname}`;
      const filePath = `documents/${req.user.id}/${fileName}`;

      // Upload to Supabase
      const { data, error } = await supabaseAdmin.storage
        .from(process.env.SUPABASE_STORAGE_BUCKET || 'vendor-documents')
        .upload(filePath, buffer, {
          contentType: mimetype,
          upsert: false
        });

      if (error) {
        throw new Error(`Supabase upload error: ${error.message}`);
      }

      // Get public URL (or signed URL for private files)
      const { data: urlData } = supabaseAdmin.storage
        .from(process.env.SUPABASE_STORAGE_BUCKET || 'vendor-documents')
        .getPublicUrl(filePath);

      res.json({
        success: true,
        data: {
          fileName: originalname,
          fileUrl: filePath,
          url: urlData.publicUrl,
          mimeType: mimetype,
          size: buffer.length
        }
      });
    } catch (error) {
      console.error('File upload error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}