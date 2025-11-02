const express = require("express");
const router = express.Router();
const { authenticateToken, optionalAuth } = require("../middleware/auth");
const { getAccess } = require("../controllers/authController");
const { ollamaRequest } = require("../controllers/ollamaController");
const testRoutes = require("./testRoutes");

// Public routes
router.post("/getAccess", getAccess);

// Test routes (with and without authentication)
router.use("/test", testRoutes);

// Ollama routes (require authentication)
// 代理 /api/ollama/* 到 http://localhost:11434/api/*
// 使用 all 方法支持所有 HTTP 方法 (GET, POST, PUT, DELETE, etc.)
router.all("/ollama*", authenticateToken, (req, res, next) => {
  ollamaRequest(req, res);
});

// Protected routes example (these will require authentication)
// router.use('/protected', authenticateToken, protectedRoutes);

module.exports = router;
