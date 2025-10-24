/**
 * Express Router for handling Admin qualification review actions (Approve/Reject).
 * * NOTE: This example assumes you have middleware like `authenticateAdmin` 
 * and a function `getUserIdFromToken` available in your application context.
 */

import express from 'express'; // <-- CHANGED from require('express')
const router = express.Router();

// Placeholder for middleware and utility functions
// In a real app, these would come from your auth module
const authenticateAdmin = (req, res, next) => {
    // Implement token verification and role check here.
    // If successful, attach user data (like user ID) to req.user
    req.user = { id: 'admin-user-123', role: 'admin' }; // Mock Admin User
    next();
};

// Mock database update function
const updateSubmissionInDB = async (submissionId, updateFields) => {
    console.log(`[DB MOCK] Updating Submission ID: ${submissionId}`);
    console.log('[DB MOCK] Fields:', updateFields);
    // Simulate database interaction delay
    await new Promise(resolve => setTimeout(resolve, 300)); 
    
    // In a real application, you would use Mongoose/Sequelize/Knex here:
    // const submission = await SubmissionModel.findByIdAndUpdate(submissionId, updateFields, { new: true });
    // if (!submission) throw new Error('Submission not found');
    
    return { success: true, submissionId, ...updateFields };
};

// --- CORE ROUTES ---

/**
 * PUT /api/admin/submissions/:id/approve
 * Approves a vendor qualification submission.
 */
router.put('/:id/approve', authenticateAdmin, async (req, res) => {
    const submissionId = req.params.id;
    const { notes } = req.body;
    const reviewerId = req.user.id; // Get admin ID from authenticated user

    if (!submissionId) {
        return res.status(400).json({ message: 'Submission ID is required.' });
    }

    try {
        const updateFields = {
            status: 'APPROVED',
            reviewNotes: notes || 'Approved without specific notes.',
            reviewedBy: reviewerId,
            lastActionDate: new Date(),
        };

        const result = await updateSubmissionInDB(submissionId, updateFields);
        
        // Log success (and potentially trigger a notification to the vendor)
        console.log(`Submission ${submissionId} APPROVED by ${reviewerId}`);

        res.status(200).json({ 
            message: 'Submission successfully approved.', 
            submission: result 
        });

    } catch (error) {
        console.error('Approval Error:', error.message);
        res.status(500).json({ message: 'Failed to approve submission.', error: error.message });
    }
});

/**
 * PUT /api/admin/submissions/:id/reject
 * Rejects a vendor qualification submission. Requires detailed review notes.
 */
router.put('/:id/reject', authenticateAdmin, async (req, res) => {
    const submissionId = req.params.id;
    const { notes } = req.body;
    const reviewerId = req.user.id; // Get admin ID from authenticated user

    if (!submissionId) {
        return res.status(400).json({ message: 'Submission ID is required.' });
    }

    // Mandatory check for rejection notes (enforced by the frontend, but must be checked here too)
    if (!notes || notes.trim().length === 0) {
        return res.status(400).json({ message: 'Review notes are mandatory for rejection.' });
    }

    try {
        const updateFields = {
            status: 'REJECTED',
            reviewNotes: notes, // Notes are guaranteed to exist here
            reviewedBy: reviewerId,
            lastActionDate: new Date(),
        };

        const result = await updateSubmissionInDB(submissionId, updateFields);
        
        // Log success (and potentially trigger a notification to the vendor)
        console.log(`Submission ${submissionId} REJECTED by ${reviewerId}`);

        res.status(200).json({ 
            message: 'Submission successfully rejected.', 
            submission: result 
        });

    } catch (error) {
        console.error('Rejection Error:', error.message);
        res.status(500).json({ message: 'Failed to reject submission.', error: error.message });
    }
});


export default router; 
