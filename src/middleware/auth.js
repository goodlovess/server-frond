const jwt = require("jsonwebtoken");
const { getRedisClient } = require("../config/redis");
const { query } = require("../config/database");
const { ResponseUtil, ERROR_CODES } = require("../utils/response");
const { parseTokenData, buildTokenData, updateConcurrent } = require("../utils/redisToken");

// 缓存时间：2小时（秒）
const USER_ACTIVE_CACHE_TTL = 2 * 60 * 60; // 7200秒

/**
 * 检查用户active状态（从合并的token数据中读取）
 * @param {string} tel - 用户手机号
 * @param {string} combinedData - 合并的token数据
 * @returns {Promise<boolean>} 用户是否active
 */
const checkUserActive = async (tel, combinedData = null) => {
  try {
    // 如果提供了合并数据，直接从中解析
    if (combinedData) {
      const parsed = parseTokenData(combinedData);
      return parsed.active === "true";
    }

    // 如果没有提供，从Redis读取（兼容旧代码）
    const redisClient = getRedisClient();
    const tokenKey = `token:${tel}`;
    const combined = await redisClient.get(tokenKey);
    
    if (combined) {
      const parsed = parseTokenData(combined);
      return parsed.active === "true";
    }

    // 如果Redis中也没有，从Postgres查询
    const userQuery = "SELECT active FROM users WHERE tel = $1";
    const result = await query(userQuery, [tel]);

    if (result.rows.length === 0) {
      return false;
    }

    return result.rows[0].active === true;
  } catch (error) {
    console.error("Error checking user active status:", error);
    // 如果出错，为了安全起见，返回false
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
    // 使用 req.get() 方法，自动处理请求头大小写问题（不区分大小写）
    const authHeader = req.get("authorization");
    const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

    if (!token) {
      return res
        .status(401)
        .json(
          ResponseUtil.unauthorized(
            "需要访问令牌",
            ERROR_CODES.UNAUTHORIZED
          )
        );
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret_key");

    // Check if token exists in Redis and get combined data (使用手机号作为key)
    const redisClient = getRedisClient();
    const tokenKey = `token:${decoded.tel}`;
    const combinedData = await redisClient.get(tokenKey);

    if (!combinedData) {
      return res
        .status(401)
        .json(
          ResponseUtil.unauthorized(
            "令牌无效或已过期",
            ERROR_CODES.TOKEN_INVALID
          )
        );
    }

    // 解析合并的数据
    const parsedData = parseTokenData(combinedData);

    // 验证 token 是否匹配
    // 如果不匹配，说明用户已经生成了新的 token，旧的 token 已失效
    if (parsedData.token !== token) {
      return res
        .status(401)
        .json(
          ResponseUtil.unauthorized(
            "令牌已失效，请重新获取",
            ERROR_CODES.TOKEN_INVALID
          )
        );
    }

    // Check token expiration
    if (decoded.exp * 1000 < Date.now()) {
      return res
        .status(401)
        .json(
          ResponseUtil.unauthorized("令牌已过期", ERROR_CODES.TOKEN_EXPIRED)
        );
    }

    // Check user active status (从合并数据中读取)
    const isActive = parsedData.active === "true";
    if (!isActive) {
      return res
        .status(403)
        .json(
          ResponseUtil.error("用户账户未激活", ERROR_CODES.FORBIDDEN)
        );
    }

    // 检查并发请求数
    const maxConcurrent = decoded.maxConcurrent || 1; // 从token中获取最大并发数，默认1
    const currentConcurrent = parsedData.concurrent;
    
    // 如果当前并发数 >= 最大并发数，返回错误
    if (currentConcurrent >= maxConcurrent) {
      return res
        .status(403)
        .json(
          ResponseUtil.error(
            "并行数超过",
            ERROR_CODES.CONCURRENT_LIMIT_EXCEEDED
          )
        );
    }
    
    // 并发数+1（更新合并数据）
    const newConcurrent = currentConcurrent + 1;
    const updatedData = updateConcurrent(combinedData, newConcurrent);
    
    // 获取 token 的过期时间，用于更新 Redis（保持相同的过期时间）
    // 由于我们只是更新值，不需要重新设置过期时间，但为了安全起见，我们可以重新设置
    // 实际上，Redis 的 GET 和 SET 不会改变过期时间，所以我们需要先获取过期时间
    const ttl = await redisClient.ttl(tokenKey);
    if (ttl > 0) {
      await redisClient.setEx(tokenKey, ttl, updatedData);
    } else {
      // 如果 TTL 为 -1（永久）或 -2（不存在），直接设置
      await redisClient.set(tokenKey, updatedData);
    }

    // Add user info to request
    req.user = {
      tel: decoded.tel,
      exp: decoded.exp,
      maxConcurrent: maxConcurrent,
      tokenKey: tokenKey, // 保存 token key，用于后续-1
    };

    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res
        .status(401)
        .json(
          ResponseUtil.unauthorized("无效令牌", ERROR_CODES.TOKEN_INVALID)
        );
    }
    return res
      .status(500)
      .json(ResponseUtil.serverError("认证错误"));
  }
};

// Middleware for optional authentication (for endpoints that don't require token)
const optionalAuth = async (req, res, next) => {
  try {
    // 使用 req.get() 方法，自动处理请求头大小写问题（不区分大小写）
    const authHeader = req.get("authorization");
    const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

    if (!token) {
      return next();
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret_key");

    // Check if token exists in Redis (使用手机号作为key)
    const redisClient = getRedisClient();
    const tokenKey = `token:${decoded.tel}`;
    const combinedData = await redisClient.get(tokenKey);

    if (!combinedData) {
      return next(); // Continue without user info if token is invalid
    }

    const parsedData = parseTokenData(combinedData);

    if (parsedData.token !== token) {
      return next(); // Continue without user info if token is invalid
    }

    // Check token expiration
    if (decoded.exp * 1000 < Date.now()) {
      return next(); // Continue without user info if token is expired
    }

    // Check user active status (从合并数据中读取)
    const isActive = parsedData.active === "true";
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
