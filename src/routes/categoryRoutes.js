import express from 'express';
import prisma from '../config/prismaClient.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { getAllCategories } from "../controllers/vendorController.js"; 

const router = express.Router();



router.get("/", authenticateToken, getAllCategories);


// Middleware to ensure only Admin or Procurement can manage categories
const authorizeAdminOrProcurement = (req, res, next) => {
    // Role IDs: 1 (Admin), 2 (Procurement Manager/Engineer)
    if (req.user?.roleId === 1 || req.user?.roleId === 2) { 
        next();
    } else {
        return res.status(403).json({ error: 'Access denied. Requires Admin or Procurement role.' });
    }
};


/**
 * GET /api/categories
 * Get a list of all Categories (Master Data)
 * Accessible by anyone for filtering/dropdowns, but CRUD operations are restricted.
 */
router.get('/', async (req, res) => {
    try {
        const categories = await prisma.category.findMany({
            orderBy: { name: 'asc' },
        });
        res.status(200).json(categories);
    } catch (error) {
        console.error('❌ Error fetching categories:', error);
        res.status(500).json({ error: 'Failed to fetch categories.' });
    }
});

/**
 * POST /api/categories
 * Create a new Category
 */
router.post('/', authenticateToken, authorizeAdminOrProcurement, async (req, res) => {
    const { name, csiCode, description } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Category name is required.' });
    }

    try {
        const newCategory = await prisma.category.create({
            data: {
                name: name.trim(),
                csiCode: csiCode ? csiCode.trim() : null,
                description,
            },
        });
        res.status(201).json(newCategory);
    } catch (error) {
        // Handle unique constraint violation (P2002) if name/csiCode already exists
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'A category with this name or CSI code already exists.' });
        }
        console.error('❌ Error creating category:', error);
        res.status(500).json({ error: 'Failed to create category.' });
    }
});

/**
 * PUT /api/categories/:id
 * Update an existing Category
 */
router.put('/:id', authenticateToken, authorizeAdminOrProcurement, async (req, res) => {
    const { id } = req.params;
    const { name, csiCode, description } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Category name is required for update.' });
    }

    try {
        const updatedCategory = await prisma.category.update({
            where: { id: parseInt(id) },
            data: {
                name: name.trim(),
                csiCode: csiCode ? csiCode.trim() : null,
                description,
            },
        });
        res.status(200).json(updatedCategory);
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Category not found.' });
        }
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'A category with this name or CSI code already exists.' });
        }
        console.error(`❌ Error updating category ${id}:`, error);
        res.status(500).json({ error: 'Failed to update category.' });
    }
});

/**
 * DELETE /api/categories/:id
 * Delete a Category
 * NOTE: This will fail if the category is currently linked to any vendors (foreign key constraint).
 */
router.delete('/:id', authenticateToken, authorizeAdminOrProcurement, async (req, res) => {
    const { id } = req.params;

    try {
        await prisma.category.delete({
            where: { id: parseInt(id) },
        });
        res.status(204).send(); // No Content on successful deletion
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Category not found.' });
        }
        if (error.code === 'P2014') {
             // Handle "The change you are trying to make requires a relationship to be deleted"
            return res.status(409).json({ error: 'Cannot delete category. It is currently linked to one or more vendors.' });
        }
        console.error(`❌ Error deleting category ${id}:`, error);
        res.status(500).json({ error: 'Failed to delete category.' });
    }
});

export default router;