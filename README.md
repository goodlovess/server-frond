# 服务器结果封装层服务

一个使用 Express 框架实现基于令牌的身份验证的 Node.js 服务。

## 功能

- 使用 JWT 的基于令牌的身份验证
- PostgreSQL 用户验证
- Redis 令牌存储与过期管理
- 标准化的 API 响应格式
- 基于环境的配置
- 用于验证的测试端点

## 先决条件

- Node.js (v14 或更高版本)
- PostgreSQL 数据库
- Redis 服务器
- UV (用于运行项目)

## 安装

1. 克隆仓库
2. 安装依赖:

   ```bash
   npm install
   ```

3. 基于.env.example 创建.env 文件:

   ```bash
   cp .env.example .env
   ```

4. 使用您的配置更新.env 文件:

   - 数据库凭证
   - Redis 配置
   - JWT 密钥

## 数据库设置

在 PostgreSQL 数据库中创建 users 表:

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 项目结构

```
src/
├── config/          # 配置文件(数据库，redis)
├── controllers/     # 请求处理器
├── middleware/      # 认证中间件
├── routes/          # API路由定义
├── utils/           # 工具函数
└── models/          # 数据模型(如有需要)
```

## API 端点

### 公共端点(无需认证)

- **POST** `/api/getAccess` - 生成访问令牌
  - 请求体: `{ "userId": "user_id" }`
  - 响应: `{ "code": 0, "data": { "token": "jwt_token" }, "msg": "令牌生成成功" }`

### 测试端点

- **GET** `/api/test/test` - 无需认证的测试端点
- **GET** `/api/test/testToken` - 需要认证的测试端点(需要令牌)
- **GET** `/api/test/testOptional` - 可选认证的测试端点

### 认证格式

对于需要认证的端点，在 Authorization 头中包含令牌:

```
Authorization: Bearer YOUR_JWT_TOKEN
```

## 响应格式

所有 API 响应遵循标准化格式:

```json
{
  "code": 0,
  "data": {},
  "msg": "成功消息"
}
```

### 错误代码

- `0` - 成功
- `1` - 一般错误
- `401` - 未授权
- `403` - 禁止访问
- `404` - 未找到
- `500` - 服务器内部错误
- `1001` - 无效用户
- `1002` - 令牌过期
- `1003` - 令牌无效
- `2001` - 数据库错误
- `2002` - Redis 错误

## 运行项目

使用 npm:

```bash
npm start
```

开发环境自动重载:

```bash
npm run dev
```

## 环境变量

| 变量           | 描述                | 默认值                                              |
| -------------- | ------------------- | --------------------------------------------------- |
| PORT           | 服务器端口          | 3000                                                |
| DB_HOST        | PostgreSQL 主机     | localhost                                           |
| DB_PORT        | PostgreSQL 端口     | 5432                                                |
| DB_USER        | PostgreSQL 用户     | postgres                                            |
| DB_PASSWORD    | PostgreSQL 密码     | postgres                                            |
| DB_NAME        | PostgreSQL 数据库名 | myapp                                               |
| REDIS_HOST     | Redis 主机          | localhost                                           |
| REDIS_PORT     | Redis 端口          | 6379                                                |
| REDIS_PASSWORD | Redis 密码          | (空)                                                |
| JWT_SECRET     | JWT 密钥            | your-super-secret-jwt-key-change-this-in-production |
| NODE_ENV       | Node 环境           | development                                         |

## 认证工作原理

1. **令牌生成** (`/api/getAccess`):

   - 用户提供 userId
   - 系统在 PostgreSQL 中验证 userId
   - 如果有效，生成 24 小时后过期的 JWT 令牌
   - 将令牌存储在 Redis 中，设置相同的过期时间
   - 向用户返回令牌

2. **令牌验证** (受保护端点):

   - 用户在 Authorization 头中包含令牌
   - 系统验证 JWT 签名
   - 检查令牌是否存在于 Redis 中
   - 验证令牌是否过期
   - 如果所有检查通过，允许访问

3. **令牌过期**:

   - 令牌在 24 小时后过期
   - 过期的令牌会自动从 Redis 中移除
   - 用户必须在过期后请求新令牌
