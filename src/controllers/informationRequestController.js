// backend/src/controllers/informationRequestController.js
import prisma from '../config/prismaClient.js';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';



/**
 * GET /api/information-requests/vendor/requests/stats
 * Get statistics for vendor requests
 */
export const getRequestStats = async (req, res) => {
    try {
      // Check if user is a vendor
      if (req.user?.roleId !== 4) {
        return res.status(403).json({ 
          success: false, 
          error: 'Access denied. Vendor access only.' 
        });
      }
  
      // Find vendor associated with this user
      const vendor = await prisma.vendor.findUnique({
        where: { userId: req.user.id },
        select: { id: true }
      });
  
      if (!vendor) {
        return res.status(404).json({ 
          success: false, 
          error: 'Vendor profile not found.' 
        });
      }
  
      const now = new Date();
  
      // Get all stats in parallel
      const [
        totalCount,
        pendingCount,
        submittedCount,
        approvedCount,
        rejectedCount,
        overdueCount
      ] = await Promise.all([
        prisma.informationRequest.count({ where: { vendorId: vendor.id } }),
        prisma.informationRequest.count({ 
          where: { 
            vendorId: vendor.id,
            status: 'PENDING',
            dueDate: { gte: now }
          }
        }),
        prisma.informationRequest.count({ 
          where: { 
            vendorId: vendor.id,
            status: 'SUBMITTED'
          }
        }),
        prisma.informationRequest.count({ 
          where: { 
            vendorId: vendor.id,
            status: 'APPROVED'
          }
        }),
        prisma.informationRequest.count({ 
          where: { 
            vendorId: vendor.id,
            status: 'REJECTED'
          }
        }),
        prisma.informationRequest.count({ 
          where: { 
            vendorId: vendor.id,
            status: 'PENDING',
            dueDate: { lt: now }
          }
        })
      ]);
  
      res.json({
        success: true,
        data: {
          total: totalCount,
          pending: pendingCount,
          submitted: submittedCount,
          approved: approvedCount,
          rejected: rejectedCount,
          overdue: overdueCount
        }
      });
  
    } catch (error) {
      console.error('Error fetching request stats:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch request statistics' 
      });
    }
  };

/**
 * GET /api/information-requests/vendor/requests
 * Get all information requests for the authenticated vendor
 */
export const getVendorRequests = async (req, res) => {
  try {
    // Check if user is a vendor
    if (req.user?.roleId !== 4) {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied. Vendor access only.' 
      });
    }

    // Find vendor associated with this user
    const vendor = await prisma.vendor.findUnique({
      where: { userId: req.user.id },
      select: { id: true }
    });

    if (!vendor) {
      return res.status(404).json({ 
        success: false, 
        error: 'Vendor profile not found.' 
      });
    }

    // Parse query parameters
    const { 
      status, 
      type, 
      priority, 
      search,
      page = 1, 
      pageSize = 20,
      sortBy = 'dueDate',
      sortOrder = 'asc'
    } = req.query;

    // Build WHERE clause
    const where = {
      vendorId: vendor.id
    };

    if (status) where.status = status;
    if (type) where.requestType = type;
    if (priority) where.priority = priority;

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const take = parseInt(pageSize);

    // Fetch requests
    const [requests, totalCount] = await prisma.$transaction([
      prisma.informationRequest.findMany({
        where,
        skip,
        take,
        orderBy: { [sortBy]: sortOrder === 'asc' ? 'asc' : 'desc' },
        select: {
          id: true,
          uuid: true,
          title: true,
          description: true,
          requestType: true,
          status: true,
          priority: true,
          dueDate: true,
          createdAt: true,
          responseDate: true,
          responseText: true,
          updatedAt: true,
          createdByName: true,
          // Include count of attachments
          _count: {
            select: {
              attachments: true,
              responseFiles: true
            }
          }
        }
      }),
      prisma.informationRequest.count({ where })
    ]);

    // Calculate stats
    const stats = await prisma.informationRequest.groupBy({
      by: ['status'],
      where: { vendorId: vendor.id },
      _count: {
        id: true
      }
    });

    // Format stats
    const statusStats = {
      total: totalCount,
      pending: 0,
      submitted: 0,
      approved: 0,
      rejected: 0,
      overdue: 0
    };

    stats.forEach(stat => {
      statusStats[stat.status.toLowerCase()] = stat._count.id;
    });

    // Calculate overdue requests
    const overdueCount = await prisma.informationRequest.count({
      where: {
        vendorId: vendor.id,
        status: 'PENDING',
        dueDate: { lt: new Date() }
      }
    });
    statusStats.overdue = overdueCount;

    res.json({
      success: true,
      data: requests,
      stats: statusStats,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(totalCount / parseInt(pageSize))
      }
    });

  } catch (error) {
    console.error('Error fetching vendor requests:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch requests' 
    });
  }
};

/**
 * GET /api/information-requests/vendor/requests/:id
 * Get details of a specific request
 */
export const getRequestDetails = async (req, res) => {
  try {
    // Check if user is a vendor
    if (req.user?.roleId !== 4) {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied. Vendor access only.' 
      });
    }

    const { id } = req.params;

    // Find vendor associated with this user
    const vendor = await prisma.vendor.findUnique({
      where: { userId: req.user.id },
      select: { id: true }
    });

    if (!vendor) {
      return res.status(404).json({ 
        success: false, 
        error: 'Vendor profile not found.' 
      });
    }

    // Fetch request with details
    const request = await prisma.informationRequest.findFirst({
      where: {
        OR: [
          { id: parseInt(id) || 0 },
          { uuid: id }
        ],
        vendorId: vendor.id
      },
      include: {
        attachments: {
          select: {
            id: true,
            fileName: true,
            url: true,
            mimeType: true,
            size: true
          }
        },
        responseFiles: {
          select: {
            id: true,
            fileName: true,
            url: true,
            mimeType: true,
            size: true
          }
        },
        createdBy: {
          select: {
            name: true,
            email: true,
            jobTitle: true
          }
        },
        document: {
          select: {
            id: true,
            fileName: true,
            url: true
          }
        },
        rfq: {
          select: {
            id: true,
            rfqNumber: true,
            title: true
          }
        }
      }
    });

    if (!request) {
      return res.status(404).json({ 
        success: false, 
        error: 'Request not found.' 
      });
    }

    // Convert file URLs to public URLs
    const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'vendor-documents';
    
    const processFiles = async (files) => {
      return Promise.all(files.map(async (file) => {
        let publicUrl = file.url;
        if (!file.url.startsWith('http')) {
          const { data } = supabaseAdmin.storage
            .from(STORAGE_BUCKET)
            .getPublicUrl(file.url);
          publicUrl = data?.publicUrl || file.url;
        }
        return { ...file, url: publicUrl };
      }));
    };

    const [attachmentsWithUrls, responseFilesWithUrls] = await Promise.all([
      processFiles(request.attachments),
      processFiles(request.responseFiles || [])
    ]);

    res.json({
      success: true,
      data: {
        ...request,
        attachments: attachmentsWithUrls,
        responseFiles: responseFilesWithUrls
      }
    });

  } catch (error) {
    console.error('Error fetching request details:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch request details' 
    });
  }
};

/**
 * POST /api/information-requests/vendor/requests/:id/respond
 * Submit a response to an information request
 */
export const submitResponse = async (req, res) => {
  try {
    // Check if user is a vendor
    if (req.user?.roleId !== 4) {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied. Vendor access only.' 
      });
    }

    const { id } = req.params;
    const { responseText, fileUrls = [] } = req.body;

    if (!responseText || responseText.trim() === '') {
      return res.status(400).json({ 
        success: false, 
        error: 'Response text is required.' 
      });
    }

    // Find vendor associated with this user
    const vendor = await prisma.vendor.findUnique({
      where: { userId: req.user.id },
      select: { id: true, companyLegalName: true }
    });

    if (!vendor) {
      return res.status(404).json({ 
        success: false, 
        error: 'Vendor profile not found.' 
      });
    }

    // Find the request
    const request = await prisma.informationRequest.findFirst({
      where: {
        OR: [
          { id: parseInt(id) || 0 },
          { uuid: id }
        ],
        vendorId: vendor.id,
        status: { in: ['PENDING', 'OVERDUE'] }
      }
    });

    if (!request) {
      return res.status(404).json({ 
        success: false, 
        error: 'Request not found or already responded.' 
      });
    }

    // Create response documents if file URLs provided
    let responseDocuments = [];
    if (fileUrls.length > 0) {
      responseDocuments = await Promise.all(fileUrls.map(async (fileUrl) => {
        const document = await prisma.document.create({
          data: {
            fileName: fileUrl.split('/').pop() || 'response-file',
            fileUrl: fileUrl,
            url: fileUrl,
            uploadedById: req.user.id,
            uploadedAt: new Date()
          }
        });
        return { id: document.id };
      }));
    }

    // Update the request with response
    const updatedRequest = await prisma.informationRequest.update({
      where: { id: request.id },
      data: {
        responseText: responseText.trim(),
        responseDate: new Date(),
        status: 'SUBMITTED',
        updatedAt: new Date(),
        responseFiles: {
          connect: responseDocuments.map(doc => ({ id: doc.id }))
        },
        timeline: request.timeline ? [
          ...request.timeline,
          {
            action: 'RESPONSE_SUBMITTED',
            timestamp: new Date().toISOString(),
            userId: req.user.id,
            userName: vendor.companyLegalName,
            notes: 'Vendor submitted response'
          }
        ] : [
          {
            action: 'RESPONSE_SUBMITTED',
            timestamp: new Date().toISOString(),
            userId: req.user.id,
            userName: vendor.companyLegalName,
            notes: 'Vendor submitted response'
          }
        ]
      },
      include: {
        responseFiles: true
      }
    });

    // Create notification for procurement (if needed)
    await prisma.notification.create({
      data: {
        userId: request.createdById,
        title: 'Information Request Response',
        body: `Vendor ${vendor.companyLegalName} has responded to request: "${request.title}"`,
        type: 'INFO',
        actionUrl: `/procurement/vendor-requests/${request.id}`,
        metadata: {
          requestId: request.id,
          vendorId: vendor.id,
          vendorName: vendor.companyLegalName
        }
      }
    });

    res.json({
      success: true,
      message: 'Response submitted successfully.',
      data: updatedRequest
    });

  } catch (error) {
    console.error('Error submitting response:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to submit response' 
    });
  }
};



// Note: We'll create the admin/procurement endpoints (createRequest, updateRequestStatus) later
// as they're not needed for the vendor dashboard frontend