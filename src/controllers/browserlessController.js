const http = require("http");
const puppeteer = require("puppeteer-core");
const { ResponseUtil } = require("../utils/response");

const TARGET_HOST = "localhost";
const TARGET_PORT = 1202; // browserless 暴露的端口
const TARGET_BASE_PATH = "";
const BROWSERLESS_WS_ENDPOINT = `ws://${TARGET_HOST}:${TARGET_PORT}`;

/**
 * 截图请求处理函数
 * 使用 Puppeteer 直接连接到 browserless 的 WebSocket 端点
 * 支持通过查询参数或请求体传递参数
 * 支持 CSS 选择器（class 或 id）限制截图区域
 */
const screenshotRequest = async (req, res) => {
  let browser = null;
  try {
    // 从查询参数或请求体中获取参数
    const url = req.query.url || req.body.url;
    const selector = req.query.selector || req.body.selector; // CSS 选择器，如 .abc 或 #test
    const waitUntil =
      req.query.waitUntil || req.body.waitUntil || "networkidle0";
    const format = req.query.format || req.body.format || "png"; // png, jpeg, webp
    const quality = req.query.quality
      ? parseInt(req.query.quality)
      : req.body.quality
      ? parseInt(req.body.quality)
      : undefined;
    const restype = req.query.restype || req.body.restype; // 返回数据格式：base64 或 binary（默认）

    // 验证必需参数
    if (!url) {
      return res.status(400).json(ResponseUtil.error("缺少必需参数：url", 400));
    }

    // 连接到 browserless 的 WebSocket 端点
    browser = await puppeteer.connect({
      browserWSEndpoint: BROWSERLESS_WS_ENDPOINT,
    });

    // 创建新页面
    const page = await browser.newPage();

    try {
      // 导航到目标 URL
      await page.goto(url, { waitUntil: waitUntil, timeout: 30000 });

      let screenshot;
      const screenshotOptions = {
        type: format,
      };

      // 如果指定了质量（仅对 jpeg/webp 有效）
      if (quality !== undefined && (format === "jpeg" || format === "webp")) {
        screenshotOptions.quality = quality;
      }

      if (selector) {
        // 如果提供了选择器，截图该元素
        await page.waitForSelector(selector, { timeout: 10000 }).catch(() => {
          throw new Error(`未找到选择器对应的元素: ${selector}`);
        });

        const element = await page.$(selector);
        if (!element) {
          throw new Error(`未找到选择器对应的元素: ${selector}`);
        }

        screenshot = await element.screenshot(screenshotOptions);
      } else {
        // 如果没有选择器，截图整个页面
        screenshotOptions.fullPage = true;
        screenshot = await page.screenshot(screenshotOptions);
      }

      // 根据 restype 参数决定返回格式
      if (restype === "base64") {
        // 返回 base64 编码的 JSON 响应
        const base64String = screenshot.toString("base64");
        res.setHeader("Content-Type", "application/json");
        res.json(
          ResponseUtil.success(
            {
              image: base64String,
              format: format,
              dataUrl: `data:image/${format};base64,${base64String}`,
            },
            "截图成功"
          )
        );
      } else {
        // 默认返回二进制数据
        const contentType = `image/${format}`;
        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.send(screenshot);
      }
    } finally {
      // 关闭页面
      await page.close();
    }
  } catch (error) {
    console.error("Browserless controller error:", error);
    if (!res.headersSent) {
      const errorMessage = error.message || "Browserless 错误";
      res.status(500).json(ResponseUtil.serverError(errorMessage));
    }
  } finally {
    // 断开浏览器连接（不关闭浏览器，因为 browserless 管理浏览器生命周期）
    if (browser) {
      try {
        browser.disconnect();
      } catch (e) {
        console.error("Error disconnecting browser:", e);
      }
    }
  }
};

/**
 * 通用代理请求处理函数
 * 代理所有其他 browserless API 请求
 */
const browserlessRequest = async (req, res) => {
  try {
    // 获取原始路径，移除代理路由前缀
    let originalPath = req.path;

    // 移除 /browserless 前缀（如果存在）
    if (originalPath.startsWith("/browserless")) {
      originalPath = originalPath.replace(/^\/browserless/, "") || "/";
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
    const browserlessReq = http.request(options, (browserlessRes) => {
      // 设置响应头
      res.statusCode = browserlessRes.statusCode;
      Object.keys(browserlessRes.headers).forEach((key) => {
        // 跳过一些不应该转发的响应头
        const lowerKey = key.toLowerCase();
        if (lowerKey !== "connection" && lowerKey !== "transfer-encoding") {
          res.setHeader(key, browserlessRes.headers[key]);
        }
      });

      // 转发响应体
      browserlessRes.on("data", (chunk) => {
        res.write(chunk);
      });

      browserlessRes.on("end", () => {
        res.end();
      });

      browserlessRes.on("error", (error) => {
        console.error("Browserless response error:", error);
        if (!res.headersSent) {
          res
            .status(500)
            .json(
              ResponseUtil.serverError(`Browserless 响应错误：${error.message}`)
            );
        }
      });
    });

    // 处理错误
    browserlessReq.on("error", (error) => {
      console.error("Browserless request error:", error);
      if (!res.headersSent) {
        res
          .status(500)
          .json(ResponseUtil.serverError(`Browserless 错误：${error.message}`));
      }
    });

    // 如果是 POST/PUT/PATCH 等需要 body 的请求，转发请求体
    if (req.method !== "GET" && req.method !== "HEAD") {
      if (req.body && Object.keys(req.body).length > 0) {
        // 如果有解析后的 body，转换为 JSON
        const bodyData = JSON.stringify(req.body);
        browserlessReq.setHeader("Content-Type", "application/json");
        browserlessReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
        browserlessReq.write(bodyData);
      } else if (req.rawBody) {
        // 如果有原始 body（比如文件上传），直接转发
        browserlessReq.write(req.rawBody);
      }
    }

    browserlessReq.end();
  } catch (error) {
    console.error("Browserless controller error:", error);
    if (!res.headersSent) {
      res
        .status(500)
        .json(ResponseUtil.serverError(`Browserless 错误：${error.message}`));
    }
  }
};

module.exports = { screenshotRequest, browserlessRequest };
