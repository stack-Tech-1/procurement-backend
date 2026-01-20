import { DocumentService } from '../services/documentService.js';
import { uploadToS3, generatePresignedUrl, getPublicUrl } from '../lib/awsS3.js';

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
      
      // If document has an S3 key (not a full URL), generate presigned URL
      if (document?.url && !document.url.startsWith('http')) {
        const presignedUrl = await generatePresignedUrl(document.url, 3600);
        if (presignedUrl) {
          document.url = presignedUrl;
        }
      }
      
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
      
      // Generate presigned URLs for all documents in the result
      if (result.data && Array.isArray(result.data)) {
        const documentsWithUrls = await Promise.all(
          result.data.map(async (document) => {
            if (document?.url && !document.url.startsWith('http')) {
              const presignedUrl = await generatePresignedUrl(document.url, 3600);
              if (presignedUrl) {
                return { ...document, url: presignedUrl };
              }
            }
            return document;
          })
        );
        result.data = documentsWithUrls;
      }
      
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

  // Upload file to AWS S3
  async uploadFile(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      const { originalname, buffer, mimetype, size } = req.file;
      const userId = req.user.id;
      
      // Generate unique filename
      const sanitizedFileName = originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      const fileName = `${Date.now()}-${sanitizedFileName}`;
      
      console.log('📤 Uploading file to S3:', {
        fileName: originalname,
        size: size,
        mimeType: mimetype,
        userId: userId
      });

      // Upload to AWS S3
      const s3Key = await uploadToS3(
        buffer,
        fileName,
        mimetype,
        'documents', // folder name
        userId.toString()
      );

      if (!s3Key) {
        throw new Error('Failed to upload file to S3');
      }

      // Generate public URL (or presigned URL for private access)
      const publicUrl = getPublicUrl(s3Key);
      
      res.json({
        success: true,
        data: {
          fileName: originalname,
          fileKey: s3Key,
          url: publicUrl,
          mimeType: mimetype,
          size: buffer.length,
          // Also provide a presigned URL for immediate access
          presignedUrl: await generatePresignedUrl(s3Key, 3600)
        }
      });
    } catch (error) {
      console.error('File upload error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to upload file'
      });
    }
  }

  // NEW: Get presigned URL for any S3 key
  async getPresignedUrl(req, res) {
    try {
      const { key } = req.params;
      const { expiresIn = 3600 } = req.query; // Default 1 hour
      
      if (!key) {
        return res.status(400).json({
          success: false,
          error: 'S3 key is required'
        });
      }

      const presignedUrl = await generatePresignedUrl(key, parseInt(expiresIn));
      
      if (!presignedUrl) {
        return res.status(404).json({
          success: false,
          error: 'File not found or access denied'
        });
      }

      res.json({
        success: true,
        data: {
          url: presignedUrl,
          expiresIn: parseInt(expiresIn)
        }
      });
    } catch (error) {
      console.error('Generate presigned URL error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // NEW: Download file directly
  async downloadFile(req, res) {
    try {
      const { key } = req.params;
      const { filename } = req.query;
      
      if (!key) {
        return res.status(400).json({
          success: false,
          error: 'S3 key is required'
        });
      }

      const presignedUrl = await generatePresignedUrl(key, 3600);
      
      if (!presignedUrl) {
        return res.status(404).json({
          success: false,
          error: 'File not found or access denied'
        });
      }

      // Redirect to presigned URL for download
      res.redirect(presignedUrl);
      
      // Alternative: Stream file through server
      /*
      const response = await fetch(presignedUrl);
      const blob = await response.blob();
      
      res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename || 'download'}"`);
      
      blob.arrayBuffer().then(buffer => {
        res.send(Buffer.from(buffer));
      });
      */
      
    } catch (error) {
      console.error('Download file error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // NEW: Upload multiple files
  async uploadMultipleFiles(req, res) {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No files uploaded'
        });
      }

      const userId = req.user.id;
      const uploadResults = [];

      for (const file of req.files) {
        const { originalname, buffer, mimetype, size } = file;
        const sanitizedFileName = originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
        const fileName = `${Date.now()}-${sanitizedFileName}`;
        
        try {
          const s3Key = await uploadToS3(
            buffer,
            fileName,
            mimetype,
            'documents',
            userId.toString()
          );

          if (s3Key) {
            const publicUrl = getPublicUrl(s3Key);
            uploadResults.push({
              success: true,
              fileName: originalname,
              fileKey: s3Key,
              url: publicUrl,
              mimeType: mimetype,
              size: size,
              presignedUrl: await generatePresignedUrl(s3Key, 3600)
            });
          }
        } catch (fileError) {
          uploadResults.push({
            success: false,
            fileName: originalname,
            error: fileError.message
          });
        }
      }

      const allSuccess = uploadResults.every(result => result.success);
      
      res.status(allSuccess ? 200 : 207).json({
        success: allSuccess,
        data: uploadResults
      });
    } catch (error) {
      console.error('Upload multiple files error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}