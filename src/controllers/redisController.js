const { getRedisClient } = require("../config/redis");
const { ResponseUtil, ERROR_CODES } = require("../utils/response");

const ALLOWED_PREFIX = "back-";

/**
 * 根据 key 从 Redis 获取字符串数据
 * - 仅允许 User-Agent 包含 Cloudflare-Worker 的请求访问
 * - 仅允许查询以 back- 前缀的 key
 * - 如果 key 不存在或没有数据，返回兜底信息“消息已过期~”
 */
const getRedisStringByKey = async (req, res) => {
  try {
    const userAgent = req.get("user-agent") || "";
    const isCloudflareWorker = userAgent.includes("Cloudflare-Worker");

    if (!isCloudflareWorker) {
      return res.status(403).json(ResponseUtil.error("仅允许 Cloudflare Worker 访问此接口", ERROR_CODES.FORBIDDEN));
    }

    const { key } = req.query;

    if (!key) {
      return res.status(400).json(ResponseUtil.error("缺少必填参数 key", ERROR_CODES.GENERAL_ERROR));
    }

    if (!key.startsWith(ALLOWED_PREFIX)) {
      return res.status(403).json(ResponseUtil.error(`仅支持 ${ALLOWED_PREFIX} 前缀的 key`, ERROR_CODES.FORBIDDEN));
    }

    const redisClient = getRedisClient();
    const value = await redisClient.get(key);

    if (value === null || value === undefined) {
      return res.status(200).json(ResponseUtil.success({ value: "消息已过期~" }, "Redis 中未找到数据，返回兜底信息"));
    }

    return res.status(200).json(ResponseUtil.success({ value }, "获取 Redis 数据成功"));
  } catch (error) {
    console.error("getRedisStringByKey error:", error);
    return res.status(500).json(ResponseUtil.serverError("获取 Redis 数据失败", ERROR_CODES.REDIS_ERROR));
  }
};

module.exports = {
  getRedisStringByKey,
};
