const http = require("http");
const { ResponseUtil } = require("../utils/response");

const TARGET_HOST = "localhost";
const TARGET_PORT = 11434;
const TARGET_BASE_PATH = "/api";

// 代理请求处理函数
const ollamaRequest = async (req, res) => {
  try {
    // 获取原始路径，移除代理路由前缀
    // req.originalUrl 包含查询字符串，req.path 不包含
    let originalPath = req.path;

    // 移除 /ollama 前缀（如果存在）
    if (originalPath.startsWith("/ollama")) {
      originalPath = originalPath.replace(/^\/ollama/, "") || "/";
    }

    // 构建目标路径
    const targetPath = `${TARGET_BASE_PATH}${originalPath}`;

    // 获取查询字符串
    const queryString = req.originalUrl.includes("?")
      ? req.originalUrl.split("?")[1]
      : "";
    const fullPath = queryString ? `${targetPath}?${queryString}` : targetPath;

    // 准备请求选项
    const options = {
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      path: fullPath,
      method: req.method,
      headers: {},
    };

    // 复制请求头，但过滤掉一些不应该转发的头
    const headersToExclude = ["host", "connection", "content-length"];
    Object.keys(req.headers).forEach((key) => {
      const lowerKey = key.toLowerCase();
      if (!headersToExclude.includes(lowerKey)) {
        options.headers[key] = req.headers[key];
      }
    });

    // 发送请求到目标服务器
    const ollamaReq = http.request(options, (ollamaRes) => {
      // 设置响应头
      res.statusCode = ollamaRes.statusCode;
      Object.keys(ollamaRes.headers).forEach((key) => {
        // 跳过一些不应该转发的响应头
        const lowerKey = key.toLowerCase();
        if (lowerKey !== "connection" && lowerKey !== "transfer-encoding") {
          res.setHeader(key, ollamaRes.headers[key]);
        }
      });

      // 转发响应体
      ollamaRes.on("data", (chunk) => {
        res.write(chunk);
      });

      ollamaRes.on("end", () => {
        res.end();
      });

      ollamaRes.on("error", (error) => {
        console.error("Ollama response error:", error);
        if (!res.headersSent) {
          res
            .status(500)
            .json(
              ResponseUtil.serverError(
                `Ollama response error: ${error.message}`
              )
            );
        }
      });
    });

    // 处理错误
    ollamaReq.on("error", (error) => {
      console.error("Ollama request error:", error);
      if (!res.headersSent) {
        res
          .status(500)
          .json(ResponseUtil.serverError(`Ollama error: ${error.message}`));
      }
    });

    // 如果是 POST/PUT/PATCH 等需要 body 的请求，转发请求体
    if (req.method !== "GET" && req.method !== "HEAD") {
      if (req.body && Object.keys(req.body).length > 0) {
        // 如果有解析后的 body，转换为 JSON
        const bodyData = JSON.stringify(req.body);
        ollamaReq.setHeader("Content-Type", "application/json");
        ollamaReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
        ollamaReq.write(bodyData);
      } else if (req.rawBody) {
        // 如果有原始 body（比如文件上传），直接转发
        ollamaReq.write(req.rawBody);
      }
    }

    ollamaReq.end();
  } catch (error) {
    console.error("Ollama controller error:", error);
    if (!res.headersSent) {
      res
        .status(500)
        .json(ResponseUtil.serverError(`Ollama error: ${error.message}`));
    }
  }
};

module.exports = { ollamaRequest };
