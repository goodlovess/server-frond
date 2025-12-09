/*
 * @Author: haolian
 * @Date: 2025-12-03 14:51:19
 * @LastEditors: haolian
 * @LastEditTime: 2025-12-03 14:53:05
 * @Description: Do not edit
 * @FilePath: /server-frond/src/routes/index.js
 */
const express = require("express");
const router = express.Router();
const { authenticateToken, optionalAuth } = require("../middleware/auth");
const { decreaseConcurrentOnFinish } = require("../middleware/concurrentControl");
const { getAccess } = require("../controllers/authController");
const { ollamaRequest } = require("../controllers/ollamaController");
const { getRedisStringByKey } = require("../controllers/redisController");
const { pythonRequest } = require("../controllers/pythonController");
const { rsshubRequest } = require("../controllers/rsshubController");
const testRoutes = require("./testRoutes");

// Public routes
router.post("/getAccess", getAccess);
router.get("/redis/getString", getRedisStringByKey);

// Test routes (with and without authentication)
router.use("/test", testRoutes);

// Ollama routes (require authentication)
// 代理 /api/ollama/* 到 http://localhost:11434/api/*
// 使用 all 方法支持所有 HTTP 方法 (GET, POST, PUT, DELETE, etc.)
router.all("/ollama*", authenticateToken, decreaseConcurrentOnFinish, (req, res, next) => {
  ollamaRequest(req, res);
});

// Python service routes (require authentication)
// 代理 /api/py/* 到 http://localhost:3001/*
// 使用 all 方法支持所有 HTTP 方法 (GET, POST, PUT, DELETE, etc.)
router.all("/py*", authenticateToken, decreaseConcurrentOnFinish, (req, res, next) => {
  pythonRequest(req, res);
});

// RSSHub routes (require authentication)
// 代理 /api/rsshub/* 到 http://localhost:1200/*
// 使用 all 方法支持所有 HTTP 方法 (GET, POST, PUT, DELETE, etc.)
// 子路由由参数传入，如 /api/rsshub/weibo/user/1727858283?limit=10&format=json
router.all("/rsshub*", authenticateToken, decreaseConcurrentOnFinish, (req, res, next) => {
  rsshubRequest(req, res);
});

// Protected routes example (these will require authentication)
// router.use('/protected', authenticateToken, protectedRoutes);

module.exports = router;
