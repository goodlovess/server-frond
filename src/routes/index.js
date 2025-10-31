const express = require('express');
const router = express.Router();
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { getAccess } = require('../controllers/authController');
const testRoutes = require('./testRoutes');

// Public routes
router.post('/getAccess', getAccess);

// Test routes (with and without authentication)
router.use('/test', testRoutes);

// Protected routes example (these will require authentication)
// router.use('/protected', authenticateToken, protectedRoutes);

module.exports = router;