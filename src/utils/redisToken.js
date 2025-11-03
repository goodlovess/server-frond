/**
 * Redis Token 工具函数
 * 用于处理合并存储的 token 数据格式：token-concurrent-active
 */

/**
 * 解析合并的 token 数据
 * @param {string} combinedData - 合并的数据字符串，格式：token-concurrent-active
 * @returns {Object} 解析后的对象 {token, concurrent, active}
 */
const parseTokenData = (combinedData) => {
  if (!combinedData) {
    return { token: null, concurrent: 0, active: "false" };
  }

  // 从右往左解析，确保即使 token 中包含 - 也能正确解析
  // 格式：{token}-{concurrent}-{active}
  // 从最后一个 - 开始，向前找倒数第二个 -
  
  const lastDashIndex = combinedData.lastIndexOf("-");
  if (lastDashIndex === -1) {
    // 没有分隔符，可能是旧格式的纯 token
    return { token: combinedData, concurrent: 0, active: "false" };
  }

  const active = combinedData.substring(lastDashIndex + 1);
  
  const secondLastDashIndex = combinedData.lastIndexOf("-", lastDashIndex - 1);
  if (secondLastDashIndex === -1) {
    // 只有两部分，格式错误或旧格式
    return { token: null, concurrent: 0, active: "false" };
  }

  const concurrent = combinedData.substring(secondLastDashIndex + 1, lastDashIndex);
  const token = combinedData.substring(0, secondLastDashIndex);

  return {
    token: token || null,
    concurrent: parseInt(concurrent, 10) || 0,
    active: active || "false",
  };
};

/**
 * 构建合并的 token 数据字符串
 * @param {string} token - JWT token
 * @param {number} concurrent - 当前并发数
 * @param {string} active - active 状态，"true" 或 "false"
 * @returns {string} 合并的字符串：token-concurrent-active
 */
const buildTokenData = (token, concurrent, active) => {
  const concurrentStr = String(concurrent || 0);
  const activeStr = active || "false";
  return `${token}-${concurrentStr}-${activeStr}`;
};

/**
 * 更新合并数据中的并发数
 * @param {string} combinedData - 原始合并数据
 * @param {number} newConcurrent - 新的并发数
 * @returns {string} 更新后的合并数据
 */
const updateConcurrent = (combinedData, newConcurrent) => {
  const parsed = parseTokenData(combinedData);
  return buildTokenData(parsed.token, newConcurrent, parsed.active);
};

/**
 * 更新合并数据中的 active 状态
 * @param {string} combinedData - 原始合并数据
 * @param {string} newActive - 新的 active 状态，"true" 或 "false"
 * @returns {string} 更新后的合并数据
 */
const updateActive = (combinedData, newActive) => {
  const parsed = parseTokenData(combinedData);
  return buildTokenData(parsed.token, parsed.concurrent, newActive);
};

module.exports = {
  parseTokenData,
  buildTokenData,
  updateConcurrent,
  updateActive,
};

