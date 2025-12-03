# 服务器结果封装层服务

一个使用 Express 框架实现基于令牌的身份验证的 Node.js 服务。

## 功能

- 使用 JWT 的基于令牌的身份验证
- PostgreSQL 用户验证
- Redis 令牌存储与过期管理
- 用户 active 状态检查与缓存（2 小时缓存）
- **接口并行数量控制**：支持配置用户允许的接口并行数量，防止并发请求超限
- 标准化的 API 响应格式
- 基于环境的配置
- 用于验证的测试端点

## 先决条件

- Node.js (v14 或更高版本)
- PostgreSQL 数据库
- Redis 服务器

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

### PostgreSQL 表设计

#### users 表

用户信息表，用于存储用户基本信息和账户状态。

**表结构:**

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50),
  tel VARCHAR(20) UNIQUE NOT NULL,
  active BOOLEAN DEFAULT true,
  expires_at VARCHAR(10) NOT NULL,
  max_concurrent_requests INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**字段说明:**

| 字段名                  | 类型        | 约束                      | 说明                                                           |
| ----------------------- | ----------- | ------------------------- | -------------------------------------------------------------- |
| id                      | SERIAL      | PRIMARY KEY               | 用户唯一标识，自增主键                                         |
| username                | VARCHAR(50) | (可选)                    | 用户名，可选字段                                               |
| tel                     | VARCHAR(20) | UNIQUE, NOT NULL          | 手机号，唯一且不能为空，用于用户认证                           |
| active                  | BOOLEAN     | DEFAULT true              | 用户账户是否激活，默认为 true                                  |
| expires_at              | VARCHAR(10) | NOT NULL                  | 用户账户有效期长度，格式为 "数字+单位"，如 "1h"、"2d"、"1y"    |
| max_concurrent_requests | INTEGER     | DEFAULT 1                 | 用户允许的接口并行数量，默认为 1（同一时间段只能请求一个接口） |
| created_at              | TIMESTAMP   | DEFAULT CURRENT_TIMESTAMP | 用户创建时间，自动设置为当前时间                               |

**expires_at 字段格式说明:**

- 支持的时间单位：`h`（小时）、`d`（天）、`y`（年）
- 格式示例：`"1h"`（1 小时）、`"2d"`（2 天）、`"1y"`（1 年）
- 实际过期时间点 = `created_at` + `expires_at`（计算得出）

**索引建议:**

```sql
-- 手机号索引（已由 UNIQUE 约束自动创建）
-- 如果需要频繁按手机号查询，可以添加：
CREATE INDEX idx_users_tel ON users(tel);

-- 激活状态索引（用于过滤活跃用户）
CREATE INDEX idx_users_active ON users(active);

-- 创建时间索引（用于结合 expires_at 计算过期时间点）
CREATE INDEX idx_users_created_at ON users(created_at);
```

**使用场景:**

- 用户认证时通过 `tel` 查询用户信息
- 验证用户账户是否激活 (`active = true`)
- 计算用户账户过期时间点：`created_at` + `expires_at`（时间长度）
- 检查用户账户是否过期：过期时间点 < 当前时间

**数据库迁移（如果表已存在）:**

如果已经存在 users 表，可以使用以下 SQL 语句进行迁移：

```sql
-- 修改 username 字段为可选（移除 NOT NULL 约束，移除 UNIQUE 约束）
ALTER TABLE users ALTER COLUMN username DROP NOT NULL;
DROP INDEX IF EXISTS users_username_key; -- 如果有唯一约束索引

-- 添加 tel 字段
ALTER TABLE users ADD COLUMN tel VARCHAR(20);
CREATE UNIQUE INDEX idx_users_tel ON users(tel);

-- 如果表中已有数据，需要为每条记录设置 tel（请根据实际情况修改）
-- UPDATE users SET tel = 'default_tel' WHERE tel IS NULL;

-- 最后设置 tel 为 NOT NULL（确保所有数据都有 tel 后再执行）
ALTER TABLE users ALTER COLUMN tel SET NOT NULL;

-- 修改 expires_at 字段从 TIMESTAMP 改为 VARCHAR（存储时间长度）
-- 注意：如果表中有数据，需要先将 TIMESTAMP 转换为时间长度格式
-- 例如：如果 expires_at 是 '2025-12-31'，created_at 是 '2025-01-01'，需要计算差值
-- ALTER TABLE users ALTER COLUMN expires_at TYPE VARCHAR(10);
-- 示例：将已有的时间戳转换为时间长度（需要根据实际情况调整）
-- UPDATE users SET expires_at = '1y' WHERE expires_at IS NOT NULL;

-- 添加 max_concurrent_requests 字段
ALTER TABLE users ADD COLUMN max_concurrent_requests INTEGER DEFAULT 1;
```

## 项目结构

```
server-frond/
├── config/                        # Redis 生产环境配置示例
│   └── redis-production.conf.example
├── src/
│   ├── config/                    # 应用配置文件(数据库，redis)
│   ├── controllers/               # 请求处理器
│   ├── middleware/                # 认证中间件和并发控制中间件
│   ├── routes/                    # API路由定义
│   ├── utils/                     # 工具函数
│   └── models/                    # 数据模型(如有需要)
├── docs/                          # 文档
├── README.md                       # 项目说明文档
└── package.json                   # 项目依赖配置
```

## API 端点

### 公共端点(无需认证)

- **POST** `/api/getAccess` - 生成访问令牌
- **GET** `/api/redis/getString` - 根据 key 从 Redis 获取字符串（未命中时返回“消息已过期~”）
  - 仅允许从 `gzhpush.kebubei.cn` 域名发起的请求
  - `key` 参数必须以 `back-` 为前缀
  - 请求体: `{ "tel": "13800138000" }`
  - 响应: `{ "code": 0, "data": { "token": "jwt_token" }, "msg": "Token generated successfully" }`
  - 说明: 通过手机号查询用户信息，验证用户有效性后生成 JWT 令牌

### 测试端点

- **GET** `/api/test/test` - 无需认证的测试端点
- **GET** `/api/test/testToken` - 需要认证的测试端点(需要令牌)
- **GET** `/api/test/testOptional` - 可选认证的测试端点

### Ollama 代理端点

- **ALL** `/api/ollama/*` - Ollama API 代理端点（需要认证）
  - 代理所有请求到 `http://localhost:11434/api/*`
  - 支持所有 HTTP 方法（GET, POST, PUT, DELETE 等）
  - 请求会被转发到本地 Ollama 服务
  - 示例: `GET /api/ollama/tags` → `http://localhost:11434/api/tags`

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
- `1004` - 并行数超过
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

   - 用户提供手机号 (tel)
   - 系统在 PostgreSQL 中通过手机号查询用户信息（包含 `expires_at` 和 `created_at`）
   - 验证用户是否存在、是否激活
   - 解析 `expires_at` 字段（时间长度格式，如 "1h"、"2d"、"1y"）
   - 计算用户账户过期时间点：`created_at` + `expires_at`（时间长度）
   - 检查账户是否过期：过期时间点 < 当前时间
   - 如果有效，将 token 过期时间设置为计算出的过期时间点
   - 从用户信息中获取 `max_concurrent_requests` 字段（默认值为 1）
   - 生成 JWT 令牌（令牌中包含 `tel`、`exp` 和 `maxConcurrent`）
   - 构建合并数据：`token-concurrent-active`（token、并发数 0、active 状态 true）
   - 将合并数据存储在 Redis 中（key 为 `token:{tel}`），设置计算出的过期时间
   - 向用户返回令牌

2. **令牌验证** (受保护端点):

   - 用户在 Authorization 头中包含令牌
   - 系统验证 JWT 签名
   - 检查令牌是否存在于 Redis 中
   - 验证令牌是否过期
   - **检查用户 active 状态（从合并数据中读取）**:
     - 从 Redis 获取合并数据（key: `token:{tel}`），解析出 active 状态
     - 如果合并数据不存在，从 PostgreSQL 查询用户 active 状态（降级方案）
     - 如果用户 `active = false`，返回 403 Forbidden 错误
   - **检查接口并发数量限制**:
     - 从 JWT token 中解析 `maxConcurrent` 字段（用户允许的最大并发请求数）
     - 从 Redis 获取合并数据（key: `token:{tel}`），解析出当前并发请求数
     - 如果当前并发数 >= 最大并发数，返回 403 Forbidden 错误（错误码：1004，错误消息："并行数超过"）
     - 如果允许，将并发数+1，更新合并数据并写回 Redis（保持相同的过期时间）
     - 将 token key 保存到 `req.user.tokenKey`，供接口结束时使用
   - 如果所有检查通过，允许访问

3. **接口请求处理**:

   - 接口请求开始时，并发计数器已通过认证中间件+1（更新合并数据中的并发数）
   - 所有需要认证的路由都应该使用 `decreaseConcurrentOnFinish` 中间件（在 `authenticateToken` 之后）
   - 该中间件会监听响应结束事件（`finish` 或 `close`）
   - 接口处理完成后（无论成功或失败），解析合并数据，将并发数-1 并更新合并数据
   - 确保每个请求都能正确释放并发资源

4. **令牌过期**:

   - 令牌过期时间点 = `created_at` + `expires_at`（解析后的时间长度）
   - 令牌会在用户账户过期时间点失效，确保与账户有效期一致
   - 过期的合并数据会自动从 Redis 中移除（包括 token、并发数和 active 状态）
   - 用户必须在过期后请求新令牌

## 数据存储设计

### Redis Key 设计

Redis 用于存储 JWT 令牌和缓存用户状态，实现令牌的快速验证、过期管理和用户状态缓存优化。

**Key 格式:**

| Key 格式      | 示例                | 说明                                                                                        |
| ------------- | ------------------- | ------------------------------------------------------------------------------------------- |
| `token:{tel}` | `token:13800138000` | 存储合并数据：JWT 令牌、当前并发请求数、用户 active 状态（格式：`token-concurrent-active`） |

**Key 详细说明:**

#### `token:{tel}`

- **用途**: 存储用户的 JWT 令牌、当前并发请求数和 active 状态的合并数据
- **存储内容**: 合并数据字符串，格式为 `{token}-{concurrent}-{active}`
  - `token`: JWT 令牌字符串（完整的 Bearer token，不包含 "Bearer " 前缀）
  - `concurrent`: 当前并发请求数（整数，字符串格式）
  - `active`: 用户 active 状态（"true" 或 "false"）
- **过期时间**: 动态计算，等于用户账户过期时间点
  - 过期时间点 = `created_at` + `expires_at`（解析后的时间长度）
  - Token 会在计算出的过期时间点失效
- **数据结构**: String
- **解析方式**: 使用 `-` 分隔符从右往左解析，确保即使 token 中包含 `-` 也能正确解析
  - 最后一个 `-` 后面是 `active`
  - 倒数第二个 `-` 到最后一个 `-` 之间是 `concurrent`
  - 前面所有部分是 `token`
- **操作命令**:
  - 设置: `SETEX token:{tel} {expiration_seconds} {token}-{concurrent}-{active}`
  - 获取: `GET token:{tel}`，然后使用工具函数解析
  - 更新: `SETEX token:{tel} {ttl} {new_combined_data}`（先获取 TTL，再更新）
  - 删除: `DEL token:{tel}` (Redis 会自动在过期后删除)
- **工作原理**:
  - **令牌生成时**: 将 token、并发数（初始化为 0）、active 状态（true）合并存储
  - **令牌验证时**: 解析合并数据，验证 token 是否匹配，检查 active 状态
  - **并发控制**:
    - 接口请求开始时，解析并发数，检查是否小于最大并发数限制
    - 如果允许，将并发数+1 并更新合并数据
    - 接口请求结束时（无论成功或失败），将并发数-1 并更新合并数据
  - **优势**:
    - 减少 Redis key 数量，提高存储效率
    - 原子性更新，确保数据一致性
    - 简化 key 管理，便于清理和维护

**Key 命名规范:**

- 使用冒号 `:` 作为分隔符，符合 Redis 键命名最佳实践
- 前缀 `token:` 用于标识令牌相关的键，便于批量操作和监控
- `{tel}` 部分使用用户的手机号，确保每个手机号只有一个有效令牌

**使用场景:**

1. **令牌生成时** (`authController.js`):

   ```javascript
   // 解析过期时间长度（如 "1h", "2d", "1y"）
   const durationMs = parseDuration(user.expires_at);

   // 计算用户账户过期时间点：created_at + expires_at
   const createdAt = new Date(user.created_at);
   const userExpiresAt = createdAt.getTime() + durationMs;
   const now = Date.now();

   // Token 过期时间设置为计算出的过期时间点
   const tokenExp = Math.floor(userExpiresAt / 1000);

   // 生成 token payload（包含 tel 和 maxConcurrent）
   const tokenPayload = {
     tel: tel,
     exp: tokenExp,
     maxConcurrent: maxConcurrentRequests,
   };

   const token = jwt.sign(tokenPayload, JWT_SECRET);

   // 构建合并数据：token-concurrent-active
   const initialConcurrent = 0;
   const initialActive = "true"; // 因为查询时已经过滤了 active = true
   const combinedData = buildTokenData(token, initialConcurrent, initialActive);

   // 存储到 Redis（key 为手机号）
   const redisExpiration = tokenExp - Math.floor(now / 1000);
   await redisClient.setEx(`token:${tel}`, redisExpiration, combinedData);
   ```

   在用户通过 `/api/getAccess` 获取令牌时，将合并数据（token、并发数、active 状态）存储到 Redis

2. **令牌验证时** (`middleware/auth.js`):

   ```javascript
   const decoded = jwt.verify(token, process.env.JWT_SECRET);
   const tokenKey = `token:${decoded.tel}`;

   // 获取合并数据
   const combinedData = await redisClient.get(tokenKey);
   if (!combinedData) {
     return res.status(401).json(/* 401 错误 */);
   }

   // 解析合并数据
   const parsedData = parseTokenData(combinedData);

   // 验证 token 是否匹配
   if (parsedData.token !== token) {
     return res.status(401).json(/* 401 错误 */);
   }

   // 检查 active 状态
   if (parsedData.active !== "true") {
     return res.status(403).json(/* 403 错误 */);
   }

   // 检查并发数并更新
   const maxConcurrent = decoded.maxConcurrent || 1;
   if (parsedData.concurrent >= maxConcurrent) {
     return res.status(403).json(/* 并行数超过 */);
   }

   // 并发数+1并更新合并数据
   const newConcurrent = parsedData.concurrent + 1;
   const updatedData = updateConcurrent(combinedData, newConcurrent);
   const ttl = await redisClient.ttl(tokenKey);
   await redisClient.setEx(tokenKey, ttl, updatedData);
   ```

   在受保护的路由中验证令牌是否存在且匹配，检查用户 active 状态和并发数限制，并更新并发数

3. **并发数减少** (`middleware/concurrentControl.js`):

   ```javascript
   // 在响应结束时减少并发数
   const combinedData = await redisClient.get(tokenKey);
   const parsedData = parseTokenData(combinedData);
   const newConcurrent = Math.max(0, parsedData.concurrent - 1);
   const updatedData = updateConcurrent(combinedData, newConcurrent);
   const ttl = await redisClient.ttl(tokenKey);
   await redisClient.setEx(tokenKey, ttl, updatedData);
   ```

   在每次请求结束时，自动将并发数-1 并更新合并数据

4. **令牌过期处理**:

   - Redis 自动过期机制会在计算出的过期时间后删除 key
   - 如果用户账户提前过期，token 也会随之失效
   - 如果需要手动撤销令牌，可以使用 `DEL token:{tel}`

5. **用户 active 状态缓存失效**:

   - 缓存会在 2 小时后自动过期
   - 如果用户的 active 状态在数据库中更改，缓存会在 2 小时后更新
   - 如果需要立即更新缓存，可以手动删除缓存 key: `DEL user:active:{tel}`

**注意事项:**

- 如果用户多次请求令牌，新的令牌会覆盖旧的令牌
- 令牌过期后，Redis 会自动删除对应的 key
- 用户 active 状态缓存时间为 2 小时，如果需要在数据库更新后立即生效，需要手动清除缓存
- 用户 active 状态检查在 token 验证之前进行，如果用户 inactive，会返回 403 Forbidden 错误

### Redis 持久化配置

在生产环境中，强烈建议配置 Redis 持久化，以防止服务器重启或崩溃时丢失数据（包括 JWT 令牌和用户状态缓存）。

Redis 提供两种持久化方式：

#### 1. RDB (Redis Database Backup) - 快照方式

RDB 会在指定时间间隔内生成数据快照，适合备份和灾难恢复。

**配置文件示例** (`redis.conf`):

```conf
# 启用 RDB 持久化
save 900 1      # 900 秒内至少 1 个 key 发生变化时保存
save 300 10     # 300 秒内至少 10 个 key 发生变化时保存
save 60 10000   # 60 秒内至少 10000 个 key 发生变化时保存

# RDB 文件保存路径
dir /var/lib/redis

# RDB 文件名
dbfilename dump.rdb

# 压缩 RDB 文件（推荐）
rdbcompression yes
```

**优点:**

- 文件小，恢复速度快
- 适合备份和迁移
- 对性能影响小

**缺点:**

- 可能丢失最后一次快照到崩溃之间的数据
- 数据量大时，fork 过程可能阻塞

#### 2. AOF (Append Only File) - 追加文件方式

AOF 记录每个写操作，提供更好的数据安全性。

**配置文件示例** (`redis.conf`):

```conf
# 启用 AOF 持久化
appendonly yes

# AOF 文件保存路径
dir /var/lib/redis

# AOF 文件名
appendfilename "appendonly.aof"

# AOF 同步策略
# always: 每个写命令都同步（最安全，性能最低）
# everysec: 每秒同步一次（推荐，平衡性能和数据安全）
# no: 由操作系统决定（性能最好，数据安全最低）
appendfsync everysec

# AOF 重写时是否同步
no-appendfsync-on-rewrite no

# AOF 文件大小增长到原来的 100% 时自动重写
auto-aof-rewrite-percentage 100

# AOF 文件大小超过 64MB 时自动重写
auto-aof-rewrite-min-size 64mb
```

**优点:**

- 数据安全性高，最多丢失 1 秒数据（everysec 策略）
- 可读性强，便于调试

**缺点:**

- 文件较大
- 恢复速度相对较慢

#### 3. 混合持久化（推荐）

Redis 4.0+ 支持 RDB + AOF 混合持久化，结合两者优点。

**配置文件示例** (`redis.conf`):

```conf
# 启用 AOF
appendonly yes
appendfsync everysec

# 启用混合持久化
aof-use-rdb-preamble yes

# RDB 配置（用于混合持久化）
save 900 1
save 300 10
save 60 10000
dbfilename dump.rdb
rdbcompression yes
```

**配置步骤:**

1. **创建 Redis 配置文件**:

   ```bash
   # 方式1: 使用项目提供的示例配置文件
   # 复制示例配置文件到生产服务器
   cp config/redis-production.conf.example /etc/redis/redis-production.conf

   # 编辑配置文件，修改密码、路径等参数
   vim /etc/redis/redis-production.conf

   # 方式2: 从默认配置开始
   cp /etc/redis/redis.conf /etc/redis/redis-production.conf
   vim /etc/redis/redis-production.conf
   ```

2. **使用配置文件启动 Redis**:

   ```bash
   # 使用配置文件启动 Redis
   redis-server /etc/redis/redis-production.conf

   # 或者使用 systemd（推荐）
   # 修改 /etc/systemd/system/redis.service
   # 在 ExecStart 中添加配置文件路径
   ```

3. **验证持久化配置**:

   ```bash
   # 连接 Redis
   redis-cli

   # 检查配置
   CONFIG GET appendonly
   CONFIG GET save

   # 手动触发保存
   BGSAVE  # RDB
   BGREWRITEAOF  # AOF
   ```

**生产环境推荐配置:**

```conf
# 混合持久化
appendonly yes
aof-use-rdb-preamble yes
appendfsync everysec

# RDB 配置（用于快速恢复）
save 300 10
save 60 1000

# 性能优化
maxmemory-policy allkeys-lru  # 内存不足时删除最少使用的 key
maxmemory 2gb                  # 设置最大内存（根据实际情况调整）

# 安全配置
requirepass your-strong-password  # 设置密码（与 REDIS_PASSWORD 环境变量对应）
bind 127.0.0.1                     # 仅本地访问（或使用防火墙）
```

**监控和维护:**

- 定期检查持久化文件大小和位置
- 监控 Redis 内存使用情况
- 设置备份策略，定期备份 RDB 和 AOF 文件
- 测试数据恢复流程

**重要提示:**

- 本项目的 JWT 令牌设置了过期时间，即使 Redis 数据丢失，过期的令牌也无法使用，安全性相对较好
- 但用户状态缓存丢失会导致首次请求需要查询数据库，建议配置持久化以保证性能
- 如果 Redis 仅用作缓存（可以丢失），可以考虑不启用持久化以提高性能
