import prisma from "../config/prismaClient.js";

/**
 * Approve a pending user.
 * PUT /api/admin/approve/:id
 * Body: { newRoleName?: "Procurement" }
 */
export const approveUser = async (req, res) => {
  try {
    const adminUser = req.user;
    if (!adminUser) return res.status(401).json({ error: "Unauthorized" });

    // Optional: verify admin role using roleId or fetch role name
    // (Assumes authorizeRole middleware already restricts to Admins)

    const { id } = req.params;
    const { newRoleName } = req.body;

    // Get user
    const user = await prisma.user.findUnique({ where: { id: Number(id) } });
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.status !== "PENDING") {
      return res.status(400).json({ error: "User is not pending approval" });
    }

    let roleId = user.roleId;

    if (newRoleName) {
      const role = await prisma.role.findUnique({ where: { name: newRoleName } });
      if (!role) return res.status(400).json({ error: `Role "${newRoleName}" not found` });
      roleId = role.id;
    }

    const updated = await prisma.user.update({
      where: { id: Number(id) },
      data: {
        status: "ACTIVE",
        isActive: true,
        roleId,
      },
      select: { id: true, name: true, email: true, roleId: true, status: true },
    });

    res.json({ message: "User approved", user: updated });
  } catch (err) {
    console.error("Error approving user:", err);
    res.status(500).json({ error: "Failed to approve user" });
  }
};


/**
 * Approve a pending qualification submission.
 * PUT /api/admin/submissions/:id/approve
 * Body: { notes?: string }
 */
export const approveSubmission = async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body; // Notes are optional for approval

        const updatedSubmission = await prisma.qualificationSubmission.update({
            where: { id: id }, // Assuming ID is a string (UUID)
            data: {
                status: 'APPROVED',
                reviewNotes: notes || 'Approved by Admin.',
                reviewedAt: new Date(),
                // You might link the admin user here: reviewedById: req.user.id,
            },
        });

        res.json({ message: 'Submission approved successfully.', submission: updatedSubmission });
    } catch (err) {
        console.error('Error approving submission:', err);
        res.status(500).json({ error: 'Failed to approve submission' });
    }
};

/**
 * Reject a pending qualification submission.
 * PUT /api/admin/submissions/:id/reject
 * Body: { notes: string } (Notes are mandatory for rejection)
 */
export const rejectSubmission = async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;

        if (!notes || notes.trim() === '') {
            return res.status(400).json({ error: 'Rejection requires detailed review notes.' });
        }

        const updatedSubmission = await prisma.qualificationSubmission.update({
            where: { id: id }, // Assuming ID is a string (UUID)
            data: {
                status: 'REJECTED',
                reviewNotes: notes,
                reviewedAt: new Date(),
                // You might link the admin user here: reviewedById: req.user.id,
            },
        });

        res.json({ message: 'Submission rejected successfully.', submission: updatedSubmission });
    } catch (err) {
        console.error('Error rejecting submission:', err);
        res.status(500).json({ error: 'Failed to reject submission' });
    }
};

/**
 * Fetch all pending qualification submissions for the Admin Dashboard.
 * GET /api/admin/submissions/pending
 */
export const getPendingSubmissions = async (req, res) => {
    try {
        const submissions = await prisma.qualificationSubmission.findMany({
            where: {
                status: 'PENDING',
            },
            // Select only necessary fields for the dashboard table
            select: {
                id: true,
                vendorName: true, // Assuming this field exists or can be derived
                category: true,   // Assuming a category field exists
                submittedAt: true,
                documents: true,  // Example field for document count
                status: true,
            },
            orderBy: {
                submittedAt: 'asc',
            },
        });

        res.json(submissions);
    } catch (err) {
        console.error('Error fetching pending submissions:', err);
        res.status(500).json({ error: 'Failed to fetch pending submissions' });
    }
};
