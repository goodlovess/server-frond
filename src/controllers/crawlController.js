const http = require("http");
const { ResponseUtil } = require("../utils/response");

const TARGET_HOST = "localhost";
const TARGET_PORT = 11235;
const TARGET_BASE_PATH = ""; // Crawl 服务在根路径

// 代理请求处理函数
const crawlRequest = async (req, res) => {
  try {
    // 获取原始路径，移除代理路由前缀
    // req.originalUrl 包含查询字符串，req.path 不包含
    let originalPath = req.path;

    // 移除 /crawl 前缀（如果存在）
    if (originalPath.startsWith("/crawl")) {
      originalPath = originalPath.replace(/^\/crawl/, "") || "/";
    }

    // 确保路径以 / 开头
    if (!originalPath.startsWith("/")) {
      originalPath = "/" + originalPath;
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
    const crawlReq = http.request(options, (crawlRes) => {
      // 设置响应头
      res.statusCode = crawlRes.statusCode;
      Object.keys(crawlRes.headers).forEach((key) => {
        // 跳过一些不应该转发的响应头
        const lowerKey = key.toLowerCase();
        if (lowerKey !== "connection" && lowerKey !== "transfer-encoding") {
          res.setHeader(key, crawlRes.headers[key]);
        }
      });

      // 转发响应体
      crawlRes.on("data", (chunk) => {
        res.write(chunk);
      });

      crawlRes.on("end", () => {
        res.end();
      });

      crawlRes.on("error", (error) => {
        console.error("Crawl service response error:", error);
        if (!res.headersSent) {
          res.status(500).json(ResponseUtil.serverError(`Crawl 服务响应错误：${error.message}`));
        }
      });
    });

    // 处理错误
    crawlReq.on("error", (error) => {
      console.error("Crawl service request error:", error);
      if (!res.headersSent) {
        res.status(500).json(ResponseUtil.serverError(`Crawl 服务错误：${error.message}`));
      }
    });

    // 如果是 POST/PUT/PATCH 等需要 body 的请求，转发请求体
    if (req.method !== "GET" && req.method !== "HEAD") {
      if (req.body && Object.keys(req.body).length > 0) {
        // 如果有解析后的 body，转换为 JSON
        const bodyData = JSON.stringify(req.body);
        crawlReq.setHeader("Content-Type", "application/json");
        crawlReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
        crawlReq.write(bodyData);
      } else if (req.rawBody) {
        // 如果有原始 body（比如文件上传），直接转发
        crawlReq.write(req.rawBody);
      }
    }

    crawlReq.end();
  } catch (error) {
    console.error("Crawl controller error:", error);
    if (!res.headersSent) {
      res.status(500).json(ResponseUtil.serverError(`Crawl 服务错误：${error.message}`));
    }
  }
};

module.exports = { crawlRequest };
