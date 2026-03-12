# 易方顺诊所助手服务器 - 上下文文档

## 项目概述

这是一个为微信小程序提供后端服务的 Node.js 服务器项目，主要用于易方顺诊所的业务管理，包括用户管理、预约管理、处方识别和 AI 咨询等功能。

### 技术栈

- **运行时**: Node.js (>=12.0.0)
- **框架**: Express 4.18.2
- **数据库**: MySQL（通过 Sequelize ORM）
- **部署平台**: 微信云托管（Docker 容器）

### 项目架构

```
yifangshun_server/
├── index.js           # 主入口文件，定义所有 API 路由
├── db.js              # 数据库连接配置和数据模型定义
├── index.html         # 首页
├── package.json       # 项目依赖和脚本配置
├── Dockerfile         # 容器构建配置
└── container.config.json # 微信云托管部署配置
```

## 数据库模型

项目使用 Sequelize ORM 定义了以下数据模型：

| 模型 | 主键 | 主要字段 | 说明 |
|------|------|----------|------|
| User | openid | phone, name, isNewUser, code, sessionKey | 用户信息表 |
| Booking | bookingId | openid, date, time, status, createTime | 预约记录表 |
| ChatMessage | messageId | openid, content, type, createTime | 聊天消息表 |
| Prescription | prescriptionId | openid, image, text, createTime | 处方识别记录表 |
| Counter | - | count | 计数器（模板遗留） |

## 核心 API 接口

### 1. 用户管理

#### 微信授权登录
```
POST /api/login
Body: { code: string }
Response: { code: 0, data: { openid, sessionKey, isNewUser, phone?, name? } }
```

#### 绑定用户信息
```
POST /api/bind-user-info
Body: { openid, name, phone }
Response: { code: 0, message: "绑定成功" }
```

### 2. 预约管理

#### 获取可预约日期
```
GET /api/available-slots?startDate=YYYY-MM-DD
Response: { code: 0, data: [{ date, status }] }
```
- 状态：`available`（可预约）、`full`（已满）、`booked`（已预约）
- 预约规则：不支持当日预约、周二不可预约

#### 创建预约
```
POST /api/booking
Body: { date, openid }
Response: { code: 0, data: { bookingId, date, status } }
```

#### 取消预约
```
DELETE /api/booking/:bookingId?openid=xxx
Response: { code: 0, message: "预约已取消" }
```
- 需提前一天取消

#### 获取我的预约
```
GET /api/my-bookings?openid=xxx
Response: { code: 0, data: [{ bookingId, date, time, status, createTime }] }
```

### 3. 处方识别

#### OCR 识别处方
```
POST /api/prescription/ocr
Body: { image, openid }
Response: { code: 0, data: { prescriptionId, text } }
```

#### 获取处方历史
```
GET /api/prescription/history?openid=xxx
Response: { code: 0, data: [{ prescriptionId, image, text, createTime }] }
```

### 4. AI 咨询

#### 发送消息
```
POST /api/chat
Body: { message, openid }
Response: { code: 0, data: { reply } }
```

#### 获取聊天历史
```
GET /api/chat/history?openid=xxx
Response: { code: 0, data: [{ messageId, content, type, createTime }] }
```

### 5. 健康检查

```
GET /health
Response: { status: "ok", message: "服务器运行正常" }
```

## 环境变量

部署时需要配置以下环境变量：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| MYSQL_ADDRESS | 数据库地址（格式：host:port） | 127.0.0.1:3306 |
| MYSQL_USERNAME | 数据库用户名 | root |
| MYSQL_PASSWORD | 数据库密码 | password |
| PORT | 服务端口（可选，默认 80） | 80 |

## 构建和运行

### 本地开发

1. 安装依赖：
```bash
npm install
```

2. 配置环境变量（可通过 .env 文件或直接设置）：
```bash
set MYSQL_ADDRESS=127.0.0.1:3306
set MYSQL_USERNAME=root
set MYSQL_PASSWORD=your_password
```

3. 启动服务：
```bash
npm start
```

服务将在 `http://localhost:80` 启动。

### Docker 部署

项目已配置 Dockerfile，支持在微信云托管上部署：

```bash
docker build -t yifangshun-server .
docker run -p 80:80 -e MYSQL_ADDRESS=... -e MYSQL_USERNAME=... -e MYSQL_PASSWORD=... yifangshun-server
```

## 开发约定

### 代码风格

- 使用 Node.js ES6+ 语法
- 遵循 Express 框架最佳实践
- 使用 async/await 处理异步操作
- 错误处理：统一返回 `{ code: 0/1, message/data }` 格式

### ID 生成

项目使用以下函数生成随机 ID：
```javascript
const generateId = () => Math.random().toString(36).substr(2, 9);
```

### 数据库同步

数据库模型使用 `sync({ alter: true })` 自动同步结构，会保留现有数据。

## 预约业务规则

1. **单用户限制**：一个用户最多同时预约一天
2. **日期限制**：不支持当日预约
3. **周期限制**：每周二不可预约
4. **取消规则**：预约当天不能取消，需提前一天

## 注意事项

1. **处方 OCR 和 AI 咨询**：当前为模拟实现，返回固定数据，实际使用需要接入真实服务
2. **用户认证**：当前使用简单的 code-based 认证，实际生产环境应使用微信小程序标准登录流程
3. **日志记录**：支持 `/api/log` 接口接收前端日志，写入 `../debug.log` 文件
4. **兼容性**：保留了模板的旧接口 `/api/count` 和 `/api/wx_openid` 以保持兼容

## 依赖说明

主要依赖包：
- `express` - Web 框架
- `sequelize` - ORM 框架
- `mysql2` - MySQL 驱动
- `cors` - 跨域支持
- `morgan` - HTTP 日志
- `body-parser` - 请求体解析

## 相关链接

- 微信云托管文档：https://developers.weixin.qq.com/miniprogram/dev/wxcloudrun/
- Express 文档：https://expressjs.com/
- Sequelize 文档：https://sequelize.org/