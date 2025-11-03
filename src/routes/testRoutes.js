const express = require('express');
const router = express.Router();
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { decreaseConcurrentOnFinish } = require('../middleware/concurrentControl');
const { ResponseUtil } = require('../utils/response');

// Test endpoint without authentication
router.get('/test', (req, res) => {
  res.json(ResponseUtil.success({ message: 'Test endpoint without authentication' }, 'Success'));
});

// Test endpoint with authentication
router.get('/testToken', authenticateToken, decreaseConcurrentOnFinish, (req, res) => {
  res.json(ResponseUtil.success({
    message: 'Test endpoint with authentication',
    user: req.user
  }, 'Success'));
});

// Test endpoint with optional authentication
router.get('/testOptional', optionalAuth, (req, res) => {
  res.json(ResponseUtil.success({
    message: 'Test endpoint with optional authentication',
    user: req.user || null,
    isAuthenticated: !!req.user
  }, 'Success'));
});

module.exports = router;