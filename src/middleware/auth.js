const jwt = require("jsonwebtoken");
const { getRedisClient } = require("../config/redis");
const { query } = require("../config/database");
const { ResponseUtil, ERROR_CODES } = require("../utils/response");

// 缓存时间：2小时（秒）
const USER_ACTIVE_CACHE_TTL = 2 * 60 * 60; // 7200秒

/**
 * 检查用户active状态（带缓存）
 * @param {string} tel - 用户手机号
 * @returns {Promise<boolean>} 用户是否active
 */
const checkUserActive = async (tel) => {
  try {
    const redisClient = getRedisClient();
    const cacheKey = `user:active:${tel}`;

    // 先从Redis缓存查询
    const cachedActive = await redisClient.get(cacheKey);
    if (cachedActive !== null) {
      // 缓存存在，返回缓存的值（"true" 或 "false" 字符串）
      return cachedActive === "true";
    }

    // 缓存不存在，从Postgres查询
    const userQuery = "SELECT active FROM users WHERE tel = $1";
    const result = await query(userQuery, [tel]);

    if (result.rows.length === 0) {
      // 用户不存在，缓存false状态
      await redisClient.setEx(cacheKey, USER_ACTIVE_CACHE_TTL, "false");
      return false;
    }

    const isActive = result.rows[0].active === true;

    // 将结果写入Redis缓存，过期时间为2小时
    await redisClient.setEx(
      cacheKey,
      USER_ACTIVE_CACHE_TTL,
      isActive ? "true" : "false"
    );

    return isActive;
  } catch (error) {
    console.error("Error checking user active status:", error);
    // 如果出错，为了安全起见，返回false
    // 但可以选择从数据库直接查询作为降级方案
    try {
      const userQuery = "SELECT active FROM users WHERE tel = $1";
      const result = await query(userQuery, [tel]);
      if (result.rows.length === 0) {
        return false;
      }
      return result.rows[0].active === true;
    } catch (dbError) {
      console.error("Database fallback query failed:", dbError);
      return false;
    }
  }
};

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers["Authorization"];
    const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

    if (!token) {
      return res
        .status(401)
        .json(
          ResponseUtil.unauthorized(
            "Access token required",
            ERROR_CODES.UNAUTHORIZED
          )
        );
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret_key");

    // Check user active status (with cache)
    const isActive = await checkUserActive(decoded.tel);
    if (!isActive) {
      return res
        .status(403)
        .json(
          ResponseUtil.error("User account is inactive", ERROR_CODES.FORBIDDEN)
        );
    }

    // Check if token exists in Redis (使用手机号作为key)
    const redisClient = getRedisClient();
    const storedToken = await redisClient.get(`token:${decoded.tel}`);

    if (!storedToken || storedToken !== token) {
      return res
        .status(401)
        .json(
          ResponseUtil.unauthorized(
            "Invalid or expired token",
            ERROR_CODES.TOKEN_INVALID
          )
        );
    }

    // Check token expiration
    if (decoded.exp * 1000 < Date.now()) {
      return res
        .status(401)
        .json(
          ResponseUtil.unauthorized("Token expired", ERROR_CODES.TOKEN_EXPIRED)
        );
    }

    // Add user info to request
    req.user = {
      tel: decoded.tel,
      exp: decoded.exp,
    };

    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res
        .status(401)
        .json(
          ResponseUtil.unauthorized("Invalid token", ERROR_CODES.TOKEN_INVALID)
        );
    }
    return res
      .status(500)
      .json(ResponseUtil.serverError("Authentication error"));
  }
};

// Middleware for optional authentication (for endpoints that don't require token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers["Authorization"];
    const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

    if (!token) {
      return next();
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret_key");

    // Check if token exists in Redis (使用手机号作为key)
    const redisClient = getRedisClient();
    const storedToken = await redisClient.get(`token:${decoded.tel}`);

    if (!storedToken || storedToken !== token) {
      return next(); // Continue without user info if token is invalid
    }

    // Check token expiration
    if (decoded.exp * 1000 < Date.now()) {
      return next(); // Continue without user info if token is expired
    }

    // Check user active status (with cache)
    const isActive = await checkUserActive(decoded.tel);
    if (!isActive) {
      return next(); // Continue without user info if user is inactive
    }

    // Add user info to request
    req.user = {
      tel: decoded.tel,
      exp: decoded.exp,
    };
  } catch (error) {
    // Ignore errors for optional auth
  }

  next();
};

module.exports = { authenticateToken, optionalAuth };
