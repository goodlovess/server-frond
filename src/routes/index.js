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
const {
  decreaseConcurrentOnFinish,
} = require("../middleware/concurrentControl");
const { getAccess } = require("../controllers/authController");
const { ollamaRequest } = require("../controllers/ollamaController");
const { getRedisStringByKey } = require("../controllers/redisController");
const { pythonRequest } = require("../controllers/pythonController");
const { rsshubRequest } = require("../controllers/rsshubController");
const { crawlRequest } = require("../controllers/crawlController");
const {
  screenshotRequest,
  browserlessRequest,
} = require("../controllers/browserlessController");
const testRoutes = require("./testRoutes");

// Public routes
router.post("/getAccess", getAccess);
router.get("/redis/getString", getRedisStringByKey);

// Test routes (with and without authentication)
router.use("/test", testRoutes);

// Ollama routes (require authentication)
// 代理 /api/ollama/* 到 http://localhost:11434/api/*
// 使用 all 方法支持所有 HTTP 方法 (GET, POST, PUT, DELETE, etc.)
router.all(
  "/ollama*",
  authenticateToken,
  decreaseConcurrentOnFinish,
  (req, res, next) => {
    ollamaRequest(req, res);
  }
);

// Python service routes (require authentication)
// 代理 /api/py/* 到 http://localhost:3001/*
// 使用 all 方法支持所有 HTTP 方法 (GET, POST, PUT, DELETE, etc.)
router.all(
  "/py*",
  authenticateToken,
  decreaseConcurrentOnFinish,
  (req, res, next) => {
    pythonRequest(req, res);
  }
);

// RSSHub routes (require authentication)
// 代理 /api/rsshub/* 到 http://localhost:1200/*
// 使用 all 方法支持所有 HTTP 方法 (GET, POST, PUT, DELETE, etc.)
// 子路由由参数传入，如 /api/rsshub/weibo/user/1727858283?limit=10&format=json
router.all(
  "/rsshub*",
  authenticateToken,
  decreaseConcurrentOnFinish,
  (req, res, next) => {
    rsshubRequest(req, res);
  }
);

// Crawl routes (require authentication)
// 代理 /api/crawl/* 到 http://localhost:11235/*
// 使用 all 方法支持所有 HTTP 方法 (GET, POST, PUT, DELETE, etc.)
// 子路由由参数传入，如 /api/crawl/crawl、/api/crawl/md 等
router.all(
  "/crawl*",
  authenticateToken,
  decreaseConcurrentOnFinish,
  (req, res, next) => {
    crawlRequest(req, res);
  }
);

// Browserless routes (require authentication)
// 截图端点：POST /api/browserless/screenshot
// 支持查询参数或请求体传递参数
// 支持 CSS 选择器（class 或 id）限制截图区域，不传选择器则截图整个页面
// 参数：url (必需), selector (可选，CSS 选择器如 .abc 或 #test), waitUntil, format, quality
router.post(
  "/browserless/screenshot",
  authenticateToken,
  decreaseConcurrentOnFinish,
  (req, res, next) => {
    screenshotRequest(req, res);
  }
);

// Browserless 通用代理端点
// 代理 /api/browserless/* 到 http://localhost:1202/*
// 使用 all 方法支持所有 HTTP 方法 (GET, POST, PUT, DELETE, etc.)
// 注意：截图端点 /browserless/screenshot 已在上面的路由处理，不会到达这里
router.all(
  "/browserless*",
  authenticateToken,
  decreaseConcurrentOnFinish,
  (req, res, next) => {
    browserlessRequest(req, res);
  }
);

// Protected routes example (these will require authentication)
// router.use('/protected', authenticateToken, protectedRoutes);

module.exports = router;
