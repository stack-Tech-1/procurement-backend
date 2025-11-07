import prisma from "../config/prismaClient.js";

/**
 * GET /api/audit/logs
 * Fetches filtered and paginated audit logs for Admin/Procurement use.
 */
export const getAuditLogs = async (req, res) => {
    // 1. Authorization: Only Admin (1) and Procurement Manager (2) can view logs.
    if (req.user?.roleId !== 1 && req.user?.roleId !== 2) {
        return res.status(403).json({ error: 'Access denied. Requires Admin or Procurement Manager privileges.' });
    }
    
    // 2. Extract Query Parameters for Filtering and Pagination
    const { 
        userId, 
        actionType, 
        entityType, 
        startDate, 
        endDate, 
        page = 1, 
        pageSize = 20 
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const take = parseInt(pageSize);

    // 3. Build the WHERE Clause
    const where = {};
    if (userId) where.userId = parseInt(userId);
    if (actionType) where.actionType = actionType;
    if (entityType) where.entityType = entityType;

    // Date Range Filtering
    if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) {
            // Adjust endDate to include the entire day (up to 23:59:59.999)
            const end = new Date(endDate);
            end.setDate(end.getDate() + 1);
            where.createdAt.lt = end;
        }
    }

    try {
        // 4. Fetch Logs and Total Count
        const [logs, totalCount] = await prisma.$transaction([
            prisma.auditLog.findMany({
                where: where,
                orderBy: { createdAt: 'desc' }, // Latest first
                skip: skip,
                take: take,
                include: {
                    // Eagerly fetch the user who performed the action
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            employeeId: true,
                        }
                    }
                },
            }),
            prisma.auditLog.count({ where: where }),
        ]);

        // 5. Post-process to flatten user data and format output
        const formattedLogs = logs.map(log => {
            const { user, ...rest } = log;
            return {
                ...rest,
                // Flatten user info
                userName: user?.name || 'System',
                userEmail: user?.email || 'System',
                userEmployeeId: user?.employeeId || null,
            };
        });

        // 6. Return Paginated Results
        res.status(200).json({
            data: formattedLogs,
            total: totalCount,
            page: parseInt(page),
            pageSize: parseInt(pageSize),
            totalPages: Math.ceil(totalCount / parseInt(pageSize)),
        });

    } catch (error) {
        console.error('❌ Audit Log Fetch Error:', error);
        res.status(500).json({ error: 'Failed to fetch audit logs.' });
    }
};