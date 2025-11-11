import prisma from '../config/prismaClient.js';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

// --- Internal Helper Functions ---

// Build WHERE clause from filters
const buildWhereClause = (filters) => {
  const where = {};
  
  filters.forEach(filter => {
    if (filter.value && filter.value !== '') {
      const field = filter.field;
      
      switch (filter.operator) {
        case 'equals':
          where[field] = { equals: filter.value };
          break;
        case 'contains':
          where[field] = { contains: filter.value, mode: 'insensitive' };
          break;
        case 'greaterThan':
          where[field] = { gt: new Date(filter.value) };
          break;
        case 'lessThan':
          where[field] = { lt: new Date(filter.value) };
          break;
        case 'in':
          // Assume comma-separated string for 'in'
          where[field] = { in: filter.value.split(',') };
          break;
        case 'between':
          if (filter.value.start && filter.value.end) {
            where[field] = {
              gte: new Date(filter.value.start),
              lte: new Date(filter.value.end)
            };
          }
          break;
        default:
          where[field] = { equals: filter.value };
      }
    }
  });
  
  return where;
};

// Calculate summary statistics
const calculateSummary = (data, columns) => {
  const summary = {};
  
  columns.forEach(column => {
    if (column.aggregationType !== 'NONE') {
      const values = data.map(row => row[column.fieldName]).filter(val => val != null);
      
      switch (column.aggregationType) {
        case 'SUM':
          summary[column.fieldName] = values.reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
          break;
        case 'AVERAGE':
          summary[column.fieldName] = values.length > 0 ? 
            values.reduce((sum, val) => sum + (parseFloat(val) || 0), 0) / values.length : 0;
          break;
        case 'COUNT':
          summary[column.fieldName] = values.length;
          break;
        case 'MIN':
          summary[column.fieldName] = values.length > 0 ? 
            Math.min(...values.map(val => parseFloat(val) || 0)) : 0;
          break;
        case 'MAX':
          summary[column.fieldName] = values.length > 0 ? 
            Math.max(...values.map(val => parseFloat(val) || 0)) : 0;
          break;
      }
      
      // Format numbers
      if (column.dataType === 'CURRENCY') {
        summary[column.fieldName] = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'SAR'
        }).format(summary[column.fieldName]);
      } else if (column.dataType === 'PERCENTAGE') {
        summary[column.fieldName] = `${summary[column.fieldName].toFixed(2)}%`;
      }
    }
  });
  
  return summary;
};

// Report Generator: Vendor Report
const generateVendorReport = async (report, filters) => {
  // NOTE: 'model' argument removed from buildWhereClause as it was unused in original logic
  const where = buildWhereClause(filters); 
  
  const vendors = await prisma.vendor.findMany({
    where,
    include: {
      categories: {
        include: {
          category: true
        }
      },
      documents: true,
      projectExperience: true,
      assignedReviewer: {
        select: {
          name: true,
          email: true
        }
      },
      contracts: true,
      submissions: {
        include: {
          rfq: true
        }
      }
    }
  });
  
  return vendors.map(vendor => ({
    id: vendor.id,
    companyLegalName: vendor.companyLegalName,
    vendorType: vendor.vendorType,
    status: vendor.status,
    vendorClass: vendor.vendorClass,
    qualificationScore: vendor.qualificationScore,
    categories: vendor.categories.map(cat => cat.category.name).join(', '),
    documentCount: vendor.documents.length,
    projectCount: vendor.projectExperience.length,
    contractCount: vendor.contracts.length,
    totalContractValue: vendor.contracts.reduce((sum, contract) => sum + (contract.contractValue || 0), 0),
    submissionCount: vendor.submissions.length,
    winRate: vendor.submissions.length > 0 ? 
      (vendor.contracts.length / vendor.submissions.length * 100).toFixed(2) + '%' : '0%',
    assignedReviewer: vendor.assignedReviewer?.name,
    createdAt: vendor.createdAt,
    updatedAt: vendor.updatedAt
  }));
};

// Report Generator: Contract Report
const generateContractReport = async (report, filters) => {
  const where = buildWhereClause(filters);
  
  const contracts = await prisma.contract.findMany({
    where,
    include: {
      vendor: true,
      rfq: true,
      ipcs: true,
      variationOrders: true
    }
  });
  
  return contracts.map(contract => ({
    id: contract.id,
    contractNumber: contract.contractNumber,
    vendor: contract.vendor.companyLegalName,
    contractValue: contract.contractValue,
    currency: contract.currency,
    status: contract.status,
    startDate: contract.startDate,
    endDate: contract.endDate,
    ipcCount: contract.ipcs.length,
    totalPaid: contract.ipcs.reduce((sum, ipc) => sum + (ipc.netPayable || 0), 0),
    remainingValue: contract.contractValue - contract.ipcs.reduce((sum, ipc) => sum + (ipc.netPayable || 0), 0),
    variationOrderCount: contract.variationOrders.length,
    variationOrderValue: contract.variationOrders.reduce((sum, vo) => sum + (vo.costImpact || 0), 0),
    createdAt: contract.createdAt
  }));
};

// Report Generator: RFQ Report
const generateRFQReport = async (report, filters) => {
  const where = buildWhereClause(filters);
  
  const rfqs = await prisma.rFQ.findMany({
    where,
    include: {
      createdBy: {
        select: {
          name: true,
          email: true
        }
      },
      submissions: {
        include: {
          vendor: true,
          evaluations: true
        }
      },
      contracts: true
    }
  });
  
  return rfqs.map(rfq => ({
    id: rfq.id,
    rfqNumber: rfq.rfqNumber,
    title: rfq.title,
    projectName: rfq.projectName,
    status: rfq.status,
    currency: rfq.currency,
    estimatedUnitPrice: rfq.estimatedUnitPrice,
    dueDate: rfq.dueDate,
    submissionCount: rfq.submissions.length,
    awarded: rfq.contracts.length > 0,
    awardedVendor: rfq.contracts[0]?.vendor?.companyLegalName || 'Not Awarded',
    awardedValue: rfq.contracts[0]?.contractValue || 0,
    createdBy: rfq.createdBy?.name,
    createdAt: rfq.createdAt
  }));
};

// Report Generator: IPC Report
const generateIPCReport = async (report, filters) => {
  const where = buildWhereClause(filters);
  
  const ipcs = await prisma.iPC.findMany({
    where,
    include: {
      contract: {
        include: {
          vendor: true
        }
      },
      submittedBy: {
        select: {
          name: true,
          email: true
        }
      }
    }
  });
  
  return ipcs.map(ipc => ({
    id: ipc.id,
    ipcNumber: ipc.ipcNumber,
    projectName: ipc.projectName,
    contractNumber: ipc.contract.contractNumber,
    vendor: ipc.contract.vendor.companyLegalName,
    periodFrom: ipc.periodFrom,
    periodTo: ipc.periodTo,
    currentValue: ipc.currentValue,
    cumulativeValue: ipc.cumulativeValue,
    deductions: ipc.deductions,
    netPayable: ipc.netPayable,
    status: ipc.status,
    submittedBy: ipc.submittedBy?.name,
    createdAt: ipc.createdAt
  }));
};

// Report Generator: Financial Report
const generateFinancialReport = async (report, filters) => {
  const [vendors, contracts, rfqs, ipcs] = await Promise.all([
    prisma.vendor.findMany({
      where: { status: 'APPROVED' }
    }),
    prisma.contract.findMany(),
    prisma.rFQ.findMany(),
    prisma.iPC.findMany()
  ]);
  
  return [{
    totalVendors: vendors.length,
    approvedVendors: vendors.filter(v => v.status === 'APPROVED').length,
    totalContractValue: contracts.reduce((sum, c) => sum + (c.contractValue || 0), 0),
    totalPayments: ipcs.reduce((sum, ipc) => sum + (ipc.netPayable || 0), 0),
    pendingPayments: ipcs.filter(ipc => ipc.status !== 'PAID').reduce((sum, ipc) => sum + (ipc.netPayable || 0), 0),
    openRFQs: rfqs.filter(rfq => ['OPEN', 'ISSUED'].includes(rfq.status)).length,
    awardedRFQs: rfqs.filter(rfq => rfq.status === 'AWARDED').length
  }];
};

// Core Logic: Advanced report data generation (calls the generators)
const generateReportData = async (reportId, filters, userId) => {
  const startTime = Date.now();
  
  // Make sure reportId is a number
  const numericReportId = parseInt(reportId, 10);

  const report = await prisma.report.findUnique({
    where: { id: numericReportId },  // Use parsed number
    include: {
      columns: {
        orderBy: { sortOrder: 'asc' }
      }
    }
  });
  
  if (!report) {
    throw new Error('Report not found');
  }
  
  let data = [];
  let summary = {};
  
  // Generate data based on dataSource
  switch (report.dataSource) {
    case 'vendors':
      data = await generateVendorReport(report, filters);
      break;
    case 'contracts':
      data = await generateContractReport(report, filters);
      break;
    case 'rfqs':
      data = await generateRFQReport(report, filters);
      break;
    case 'ipcs':
      data = await generateIPCReport(report, filters);
      break;
    case 'financial':
      data = await generateFinancialReport(report, filters);
      break;
    default:
      throw new Error(`Unsupported data source: ${report.dataSource}`);
  }
  
  // Calculate summary statistics
  summary = calculateSummary(data, report.columns);
  
  const executionTime = Date.now() - startTime;
  
  return {
    columns: report.columns,
    rows: data,
    summary,
    generatedAt: new Date().toISOString(),
    executionTime,
    totalRecords: data.length
  };
};

// Generator: Excel
// Replace the current generateExcel function:

// Generator: Excel
const generateExcel = async (reportData) => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Report');
      
      // Add headers
      const headers = reportData.columns.map(col => col.columnLabel);
      worksheet.addRow(headers);
      
      // Style headers
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6E6FA' }
      };
      
      // Add data rows
      reportData.rows.forEach(row => {
        const rowData = reportData.columns.map(col => {
          const value = row[col.fieldName];
          // Handle different data types
          if (value === null || value === undefined) return '';
          if (col.dataType === 'CURRENCY' && typeof value === 'number') {
            return value;
          }
          return value.toString();
        });
        worksheet.addRow(rowData);
      });
      
      // Auto-fit columns
      worksheet.columns = reportData.columns.map((col, index) => {
        return { 
          header: col.columnLabel,
          key: col.fieldName,
          width: Math.max(col.columnLabel.length, 15) 
        };
      });
      
      return await workbook.xlsx.writeBuffer();
    } catch (error) {
      console.error('Excel generation error:', error);
      throw new Error('Failed to generate Excel file');
    }
  };
  
  // Generator: CSV (Enhanced)
  const generateCSV = (reportData) => {
    try {
      const headers = reportData.columns.map(col => `"${col.columnLabel.replace(/"/g, '""')}"`).join(',');
      
      const rows = reportData.rows.map(row => {
        return reportData.columns.map(col => {
          const value = row[col.fieldName];
          if (value === null || value === undefined) return '""';
          // Handle special characters in CSV
          const stringValue = value.toString().replace(/"/g, '""');
          return `"${stringValue}"`;
        }).join(',');
      });
      
      return [headers, ...rows].join('\n');
    } catch (error) {
      console.error('CSV generation error:', error);
      throw new Error('Failed to generate CSV file');
    }
  };
  
  // Generator: PDF (New Implementation)
  const generatePDF = (reportData) => {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const buffers = [];
        
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          resolve(pdfData);
        });
        
        // Add title
        doc.fontSize(20).text('Procurement Report', { align: 'center' });
        doc.moveDown();
        
        // Add generation info
        doc.fontSize(10)
           .text(`Generated on: ${new Date(reportData.generatedAt).toLocaleString()}`, { align: 'right' })
           .text(`Total Records: ${reportData.totalRecords}`, { align: 'right' });
        
        doc.moveDown();
        
        // Add summary section if available
        if (reportData.summary && Object.keys(reportData.summary).length > 0) {
          doc.fontSize(14).text('Summary', { underline: true });
          doc.moveDown(0.5);
          
          Object.entries(reportData.summary).forEach(([key, value]) => {
            const label = reportData.columns.find(col => col.fieldName === key)?.columnLabel || key;
            doc.fontSize(10).text(`${label}: ${value}`);
          });
          
          doc.moveDown();
        }
        
        // Add table headers
        doc.fontSize(12).text('Report Data', { underline: true });
        doc.moveDown(0.5);
        
        // Create table
        const tableTop = doc.y;
        const colWidth = (doc.page.width - 100) / reportData.columns.length;
        
        // Table headers
        doc.fontSize(10).font('Helvetica-Bold');
        reportData.columns.forEach((col, i) => {
          doc.text(col.columnLabel, 50 + (i * colWidth), tableTop, {
            width: colWidth,
            align: 'left'
          });
        });
        
        // Table rows
        doc.font('Helvetica');
        let yPosition = tableTop + 20;
        
        reportData.rows.forEach((row, rowIndex) => {
          // Check if we need a new page
          if (yPosition > doc.page.height - 50) {
            doc.addPage();
            yPosition = 50;
          }
          
          reportData.columns.forEach((col, colIndex) => {
            const value = row[col.fieldName] || '';
            doc.text(value.toString(), 50 + (colIndex * colWidth), yPosition, {
              width: colWidth,
              align: 'left'
            });
          });
          
          yPosition += 15;
        });
        
        doc.end();
      } catch (error) {
        console.error('PDF generation error:', error);
        reject(new Error('Failed to generate PDF file'));
      }
    });
  };

// --- Public Route Handlers (Exported Functions) ---

/**
 * Get all reports for user
 */
export const getReports = async (req, res) => {
  try {
    const { category, search, page = 1, limit = 20, favorite } = req.query;
    const userId = req.user.id;
    
    const where = {
      OR: [
        { createdById: userId },
        { isPublic: true }
      ]
    };
    
    if (category) {
      where.category = category;
    }
    
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }
    
    if (favorite === 'true') {
      where.favorites = {
        some: { userId }
      };
    }
    
    const parsedLimit = parseInt(limit);
    const parsedPage = parseInt(page);

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        include: {
          filters: {
            orderBy: { sortOrder: 'asc' }
          },
          columns: {
            orderBy: { sortOrder: 'asc' }
          },
          favorites: {
            where: { userId }
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          _count: {
            select: {
              executions: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (parsedPage - 1) * parsedLimit,
        take: parsedLimit
      }),
      prisma.report.count({ where })
    ]);
    
    // Add isFavorite flag
    const reportsWithFavorites = reports.map(report => ({
      ...report,
      isFavorite: report.favorites.length > 0
    }));
    
    res.json({
      success: true,
      data: reportsWithFavorites,
      total,
      page: parsedPage,
      totalPages: Math.ceil(total / parsedLimit)
    });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reports'
    });
  }
};

/**
 * Get report by ID (MISSING METHOD ADDED)
 */
export const getReportById = async (req, res) => {
    try {
        const { id } = req.params;
        const reportId = parseInt(id, 10);

        if (isNaN(reportId)) {
            return res.status(400).json({
              success: false,
              message: 'Invalid report ID'
            });
          }

    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: {
        filters: {
          orderBy: { sortOrder: 'asc' }
        },
        columns: {
          orderBy: { sortOrder: 'asc' }
        },
        createdBy: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error('Get report by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch report'
    });
  }
};


/**
 * Create new report
 */
export const createReport = async (req, res) => {
  try {
    const { name, description, category, dataSource, filters, columns, isPublic } = req.body;
    const userId = req.user.id;
    
    const report = await prisma.report.create({
      data: {
        name,
        description,
        category,
        dataSource,
        createdById: userId,
        isPublic: isPublic || false,
        filters: {
          create: filters || []
        },
        columns: {
          create: columns || []
        }
      },
      include: {
        filters: true,
        columns: true
      }
    });
    
    res.status(201).json({
      success: true,
      data: report,
      message: 'Report created successfully'
    });
  } catch (error) {
    console.error('Create report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create report'
    });
  }
};

/**
 * Execute report with advanced data generation
 */
export const executeReport = async (req, res) => {
  let execution; // Defined here to be accessible in catch block
  try {
    const { id } = req.params;
    const { filters = [] } = req.body;
    const userId = req.user.id;
    const reportId = parseInt(id, 10);

    if (isNaN(reportId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid report ID'
        });
      }
    
    // Create execution record - use parsed reportId
    execution = await prisma.reportExecution.create({
        data: {
          reportId: reportId,  // Use the parsed number
          executedById: userId,
          status: 'RUNNING',
          parameters: filters
        }
      });
    
      // Generate report data - use parsed reportId
      const reportData = await generateReportData(reportId, filters, userId);
      
      // Update execution record
      await prisma.reportExecution.update({
        where: { id: execution.id },
        data: {
          status: 'COMPLETED',
          recordCount: reportData.rows.length,
          executionTime: reportData.executionTime
        }
      });
    
    res.json({
      success: true,
      data: reportData,
      executionId: execution.id
    });
  } catch (error) {
    console.error('Execute report error:', error);
    
    // Update execution as failed only if it was successfully created
    if (execution?.id) {
        await prisma.reportExecution.update({
            where: { id: execution.id },
            data: {
                status: 'FAILED',
                errorMessage: error.message
            }
        });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to execute report'
    });
  }
};

/**
 * Update report
 */
export const updateReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, category, dataSource, filters, columns, isPublic } = req.body;
    const reportId = parseInt(id, 10);

    if (isNaN(reportId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid report ID'
        });
      }
    
    // First, delete existing filters and columns
    await prisma.reportFilter.deleteMany({
      where: { reportId: reportId }
    });
    
    await prisma.reportColumn.deleteMany({
      where: { reportId: reportId }
    });
    
    // Then update the report with new filters and columns
    const report = await prisma.report.update({
      where: { id: reportId },
      data: {
        name,
        description,
        category,
        dataSource,
        isPublic,
        filters: {
          create: filters || []
        },
        columns: {
          create: columns || []
        }
      },
      include: {
        filters: true,
        columns: true
      }
    });
    
    res.json({
      success: true,
      data: report,
      message: 'Report updated successfully'
    });
  } catch (error) {
    console.error('Update report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update report'
    });
  }
};

/**
 * Delete report
 */
export const deleteReport = async (req, res) => {
  try {
    const { id } = req.params;
    const reportId = parseInt(id, 10);
    
    if (isNaN(reportId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report ID'
      });
    }
    
    await prisma.report.delete({
      where: { id: reportId }
    });
    
    res.json({
      success: true,
      message: 'Report deleted successfully'
    });
  } catch (error) {
    console.error('Delete report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete report'
    });
  }
};

/**
 * Schedule report
 */
export const scheduleReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { scheduleFrequency, nextSchedule } = req.body;
    const reportId = parseInt(id, 10);
    
    if (isNaN(reportId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report ID'
      });
    }
    
    const report = await prisma.report.update({
      where: { id: reportId },
      data: {
        isScheduled: true,
        scheduleFrequency,
        nextSchedule: nextSchedule ? new Date(nextSchedule) : null
      }
    });
    
    res.json({
      success: true,
      data: report,
      message: 'Report scheduled successfully'
    });
  } catch (error) {
    console.error('Schedule report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to schedule report'
    });
  }
};

/**
 * Toggle favorite
 */
// In reportController.js, update the toggleFavorite function:

export const toggleFavorite = async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      // Parse the ID to ensure it's a number
      const reportId = parseInt(id, 10);
      
      if (isNaN(reportId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid report ID'
        });
      }
  
      const existingFavorite = await prisma.userReportFavorite.findUnique({
        where: {
          userId_reportId: {
            userId,
            reportId: reportId  // Use the parsed number
          }
        }
      });
      
      if (existingFavorite) {
        await prisma.userReportFavorite.delete({
          where: {
            userId_reportId: {
              userId,
              reportId: reportId  // Use the parsed number
            }
          }
        });
        
        res.json({
          success: true,
          isFavorite: false,
          message: 'Report removed from favorites'
        });
      } else {
        await prisma.userReportFavorite.create({
          data: {
            userId,
            reportId: reportId  // Use the parsed number
          }
        });
        
        res.json({
          success: true,
          isFavorite: true,
          message: 'Report added to favorites'
        });
      }
    } catch (error) {
      console.error('Toggle favorite error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update favorite'
      });
    }
  };
  
/**
 * Get report templates
 */
export const getReportTemplates = async (req, res) => {
  try {
    const templates = await prisma.reportTemplate.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' }
    });
    
    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch report templates'
    });
  }
};

/**
 * Get report executions history
 */
export const getReportExecutions = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const reportId = parseInt(id, 10);
    
    if (isNaN(reportId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report ID'
      });
    }
    
    const parsedLimit = parseInt(limit);
    const parsedPage = parseInt(page);

    const [executions, total] = await Promise.all([
      prisma.reportExecution.findMany({
        where: { reportId: reportId },
        include: {
          executedBy: {
            select: {
              name: true,
              email: true
            }
          }
        },
        orderBy: { executedAt: 'desc' },
        skip: (parsedPage - 1) * parsedLimit,
        take: parsedLimit
      }),
      prisma.reportExecution.count({
        where: { reportId: reportId }
      })
    ]);
    
    res.json({
      success: true,
      data: executions,
      total,
      page: parsedPage,
      totalPages: Math.ceil(total / parsedLimit)
    });
  } catch (error) {
    console.error('Get executions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch report executions'
    });
  }
};

/**
 * Export report
 */
export const exportReport = async (req, res) => {
    try {
      const { id } = req.params;
      const { format = 'excel', filters = [] } = req.body;
      const userId = req.user.id;
      const reportId = parseInt(id, 10);
  
      if (isNaN(reportId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid report ID'
        });
      }
      
      const reportData = await generateReportData(reportId, filters, userId);
      
      let fileData;
      let fileName = `report_${Date.now()}`;
      let contentType;
  
      switch (format) {
        case 'excel':
          fileData = await generateExcel(reportData);
          fileName += '.xlsx';
          contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          break;
        case 'csv':
          fileData = generateCSV(reportData);
          fileName += '.csv';
          contentType = 'text/csv';
          break;
        case 'pdf':
          fileData = await generatePDF(reportData);
          fileName += '.pdf';
          contentType = 'application/pdf';
          break;
        default:
          throw new Error('Unsupported export format');
      }
      
      // Save execution record
      await prisma.reportExecution.create({
        data: {
          reportId: reportId,
          executedById: userId,
          status: 'COMPLETED',
          parameters: filters,
          recordCount: reportData.rows.length,
          filePath: fileName
        }
      });
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(fileData);
      
    } catch (error) {
      console.error('Export report error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export report'
      });
    }
  };