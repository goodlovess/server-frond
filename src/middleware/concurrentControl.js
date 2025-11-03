const { getRedisClient } = require("../config/redis");
const { parseTokenData, updateConcurrent } = require("../utils/redisToken");

/**
 * 并发控制中间件：在响应结束时减少并发计数器
 * 这个中间件应该在认证中间件之后使用
 */
const decreaseConcurrentOnFinish = (req, res, next) => {
  // 确保只在有 token key 的情况下才处理
  if (req.user && req.user.tokenKey) {
    let hasDecreased = false; // 确保只执行一次

    const decreaseConcurrent = async () => {
      if (hasDecreased) return;
      hasDecreased = true;

      try {
        const redisClient = getRedisClient();
        const tokenKey = req.user.tokenKey;
        
        // 获取当前的合并数据
        const combinedData = await redisClient.get(tokenKey);
        if (!combinedData) {
          return; // 如果数据不存在，直接返回
        }

        // 解析并减少并发数
        const parsedData = parseTokenData(combinedData);
        const newConcurrent = Math.max(0, parsedData.concurrent - 1); // 确保不小于0
        
        // 更新合并数据
        const updatedData = updateConcurrent(combinedData, newConcurrent);
        
        // 获取剩余过期时间并更新
        const ttl = await redisClient.ttl(tokenKey);
        if (ttl > 0) {
          await redisClient.setEx(tokenKey, ttl, updatedData);
        } else {
          // 如果 TTL 为 -1（永久）或 -2（不存在），直接设置
          await redisClient.set(tokenKey, updatedData);
        }
      } catch (error) {
        console.error("Error decreasing concurrent counter:", error);
      }
    };

    // 监听响应结束事件，确保无论成功失败都会执行-1操作
    res.on("finish", decreaseConcurrent);
    res.on("close", decreaseConcurrent);
  }

  next();
};

module.exports = { decreaseConcurrentOnFinish };

