/*
 * @Author: goodlovess 936106161@qq.com
 * @Date: 2025-11-02 11:43:10
 * @LastEditors: goodlovess 936106161@qq.com
 * @LastEditTime: 2025-11-02 19:22:20
 * @FilePath: /server-frond/src/controllers/authController.js
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
const jwt = require("jsonwebtoken");
const { getRedisClient } = require("../config/redis");
const { query } = require("../config/database");
const { ResponseUtil, ERROR_CODES } = require("../utils/response");
const { buildTokenData } = require("../utils/redisToken");

/**
 * 解析时间长度字符串，转换为毫秒数
 * @param {string} durationStr - 时间长度字符串，如 "1h", "2d", "1y"
 * @returns {number} 毫秒数
 */
const parseDuration = (durationStr) => {
  if (!durationStr || typeof durationStr !== "string") {
    throw new Error("Invalid duration format");
  }

  // 匹配数字和单位 (h, d, y)
  const match = durationStr.match(/^(\d+)([hdy])$/);
  if (!match) {
    throw new Error(
      "Invalid duration format. Only 'h' (hour), 'd' (day), 'y' (year) are allowed"
    );
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  // 根据单位转换为毫秒
  const multipliers = {
    h: 60 * 60 * 1000, // 小时
    d: 24 * 60 * 60 * 1000, // 天
    y: 365 * 24 * 60 * 60 * 1000, // 年（简化计算，不考虑闰年）
  };

  return value * multipliers[unit];
};

const getAccess = async (req, res) => {
  try {
    const { tel } = req.body;

    if (!tel) {
      return res
        .status(400)
        .json(ResponseUtil.error("手机号是必填项", ERROR_CODES.GENERAL_ERROR));
    }

    // 从 PostgreSQL 通过手机号查询用户信息
    const userQuery =
      "SELECT id, tel, username, expires_at, created_at, COALESCE(max_concurrent_requests, 1) as max_concurrent_requests FROM users WHERE tel = $1 AND active = true";
    const result = await query(userQuery, [tel]);

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json(
          ResponseUtil.error(
            "没有该用户或者用户已过期",
            ERROR_CODES.INVALID_USER
          )
        );
    }

    const user = result.rows[0];

    // 解析过期时间长度（如 "1h", "2d", "1y"）
    let durationMs;
    try {
      durationMs = parseDuration(user.expires_at);
    } catch (error) {
      return res
        .status(400)
        .json(
          ResponseUtil.error(
            `过期时间格式无效：${error.message}`,
            ERROR_CODES.GENERAL_ERROR
          )
        );
    }

    // 计算用户账户过期时间点：created_at + expires_at
    const createdAt = new Date(user.created_at);
    const userExpiresAt = createdAt.getTime() + durationMs;
    const now = Date.now();

    // 检查用户账户是否过期
    if (userExpiresAt < now) {
      return res
        .status(403)
        .json(ResponseUtil.error("用户账户已过期", ERROR_CODES.INVALID_USER));
    }

    // Token 过期时间设置为计算出的过期时间点
    const tokenExp = Math.floor(userExpiresAt / 1000);

    // Generate token (基于 tel、过期时间和最大并发数)
    const maxConcurrentRequests = user.max_concurrent_requests || 1;
    const tokenPayload = {
      tel: tel,
      exp: tokenExp,
      maxConcurrent: maxConcurrentRequests,
    };

    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET || "secret_key"
    );

    // Store token in Redis with expiration time (使用手机号作为key)
    // 合并存储：token-concurrent-active 格式
    // 注意：使用 setEx 会覆盖该手机号对应的旧 token，使旧 token 立即失效
    const redisClient = getRedisClient();
    const redisExpiration = tokenExp - Math.floor(now / 1000); // 剩余秒数
    const initialConcurrent = 0;
    const initialActive = "true"; // 因为查询时已经过滤了 active = true
    const combinedData = buildTokenData(
      token,
      initialConcurrent,
      initialActive
    );
    await redisClient.setEx(`token:${tel}`, redisExpiration, combinedData);

    res.json(ResponseUtil.success({ token }, "令牌生成成功"));
  } catch (error) {
    console.error("Get access error:", error);
    res.status(500).json(ResponseUtil.serverError("生成令牌失败"));
  }
};

module.exports = { getAccess };
