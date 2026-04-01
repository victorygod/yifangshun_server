# API测试说明

## 测试目录结构

```
test/
├── run_all.js               # 测试入口脚本（运行所有测试）
├── test-helpers.js          # 测试辅助工具
├── README.md                # 本文档
└── tests/                   # 测试模块目录
    ├── test_login.js        # 登录相关测试
    ├── test_home_login.js   # 首页登录测试
    ├── test_booking.js      # 预约管理测试
    ├── test_prescription.js # 处方识别测试
    ├── test_stock.js        # 库存管理系统测试
    ├── test_chat.js         # AI咨询测试
    ├── test_user_manager.js # 用户管理测试
    ├── test_data_management.js # 数据管理测试
    ├── test_system.js       # 系统接口测试
    ├── test_permission.js   # 权限控制测试
    └── test_readonly_api.js # 只读API测试
```

## 使用方法

### 快速开始

运行完整测试（需要先启动服务器）：
```bash
# 启动服务器
npm start

# 另开终端，运行测试
node test/run_all.js
```

### 单独运行测试模块

```bash
node test/tests/test_login.js
```

## 测试工作流程

### 开发新API的标准流程

1. **修改测试脚本**
   - 在 `test/tests/` 目录下添加或修改对应的测试模块
   - 确保测试用例覆盖所有场景（正常流程、错误处理、业务规则）
   - 在 `test/run_all.js` 的 `testModules` 数组中添加新模块

2. **运行测试**
   ```bash
   node test/run_all.js
   ```

3. **修改代码**
   - 根据测试结果修改API代码
   - 确保所有测试通过

4. **更新文档**
   - 更新 `docs/API接口文档.md`

5. **再次测试**
   ```bash
   node test/run_all.js
   ```

6. **提交代码**
   - 确保所有测试通过
   - 提交测试脚本、代码和文档

## 测试模块说明

### test_login.js
- 测试登录相关API（4个接口）
- 包括：登录、绑定用户信息、绑定手机号、检查管理员权限

### test_booking.js
- 测试预约管理API（4个接口）
- 包括：获取可预约日期、创建预约、取消预约、获取我的预约
- 验证业务规则：周二不可预约、不支持当日预约、单用户限制

### test_prescription.js
- 测试处方识别API（9个接口）
- 包括：保存处方、获取处方历史、获取处方列表、更新处方、删除处方、审核处方
- 验证业务规则：重复上传、自动清理过期处方、权限控制

### test_chat.js
- 测试AI咨询API（1个接口）
- 包括：发送消息

### test_system.js
- 测试系统接口（3个接口）
- 包括：健康检查、接收日志、获取首页用户列表

### test_permission.js
- 测试权限控制（2个接口）
- 包括：获取处方列表、更新处方
- 验证不同角色的访问权限

## 测试数据管理

测试脚本会自动：
1. 创建测试用户（普通用户、管理员、超级管理员）
2. 创建测试数据（处方、预约等）
3. 测试完成后自动清理测试数据

## 注意事项

1. **服务器启动**：运行测试前需要先启动服务器 (`npm start`)
2. **测试数据**：测试数据不会影响生产环境（使用本地JSON数据库）
3. **微信登录**：使用测试模式，不需要真实的微信code
4. **端口占用**：如果80端口被占用，先停止占用进程再启动服务器

## 扩展测试

### 添加新的测试模块

1. 在 `test/tests/` 目录下创建新的测试文件
2. 导出 `runXxxTests` 函数
3. 在 `test/run_all.js` 的 `testModules` 数组中添加新模块

### 示例

```javascript
// test/tests/test_new_feature.js
const { request, test, assertEquals } = require('../test-helpers');

async function runNewFeatureTests(testUsers) {
  console.log('\n📋 测试新功能API');

  await test('GET /api/new-feature - 测试功能', async () => {
    const { response, data } = await request('GET', '/api/new-feature', null, testUsers.admin.token);

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
  });

  return { passed: 1, failed: 0, skipped: 0 };
}

module.exports = { runNewFeatureTests };
```

```javascript
// test/run_all.js - 添加到 testModules 数组
const testModules = [
  // ... 其他模块
  'test_new_feature.js'
];
```

## 常见问题

### Q: 测试失败怎么办？
A: 查看错误信息，确定是业务逻辑问题还是测试脚本问题，然后修改代码或测试脚本。

### Q: 如何只测试某个API？
A: 在对应的测试模块中注释掉不需要的测试用例。

### Q: 测试数据会影响生产数据吗？
A: 不会。测试使用本地JSON数据库，不会影响生产环境的MySQL数据库。

### Q: 测试失败会导致数据清理失败吗？
A: 可能会。如果测试异常中断，可能需要手动清理 `wrappers/local-data/` 目录下的测试数据。

## 维护建议

1. 每次添加新的API时，都应该在测试脚本中添加相应的测试用例
2. 每次修改API逻辑时，都应该运行测试脚本，确保没有破坏现有功能
3. 定期检查测试覆盖率，确保所有API都有相应的测试用例
4. 保持测试脚本的更新，与API接口文档保持同步

---

## 业务场景覆盖分析

### 处方上传流程核心场景

#### 场景矩阵

| # | 场景描述 | 用户类型 | 预期行为 | 测试覆盖 |
|---|---------|---------|---------|---------|
| 1 | 首次上传处方 | 普通用户 | 创建待审核记录，code:0 | ✅ |
| 2 | 重复上传同一处方ID | 普通用户 | 返回错误，code:1 | ✅ |
| 3 | 首次上传处方 | 管理员 | 创建已审核记录，code:0 | ✅ |
| 4 | 重复上传同一处方ID | 管理员 | 返回code:2需确认覆盖 | ✅ |
| 5 | 确认覆盖 | 管理员 | 更新已审核记录，code:0 | ✅ |
| 6 | 审核待审核处方 | 管理员 | 通过/拒绝，code:0 | ✅ |
| 7 | 审核时已存在已审核记录 | 管理员 | needConfirm:true | ✅ |
| 8 | 确认审核覆盖 | 管理员 | 覆盖已审核记录，code:0 | ✅ |

### 数据流转图

```
普通用户上传处方:
┌─────────┐    savePrescription     ┌─────────────┐
│  前端   │ ───────────────────────> │  后端       │
│ (OCR)   │    prescriptionId       │             │
└─────────┘                         └─────────────┘
      │                                    │
      │                                    ▼
      │                            检查是否存在
      │                         prescriptionId_待审核
      │                                    │
      │                    ┌───────────────┼───────────────┐
      │                    ▼               │               ▼
      │               不存在               │            已存在
      │                    │               │               │
      │                    ▼               │               ▼
      │             创建新记录              │         返回错误
      │           code: 0, 待审核          │         code: 1
      │                                    │
      └────────────────────────────────────┘

管理员上传处方:
┌─────────┐    savePrescription     ┌─────────────┐
│  前端   │ ───────────────────────> │  后端       │
│ (OCR)   │    prescriptionId       │             │
└─────────┘                         └─────────────┘
      │                                    │
      │                                    ▼
      │                            检查是否存在
      │                         prescriptionId_已审核
      │                                    │
      │                    ┌───────────────┼───────────────┐
      │                    ▼               │               ▼
      │               不存在               │            已存在
      │                    │               │               │
      │                    ▼               │               ▼
      │             创建新记录              │         返回 code: 2
      │           code: 0, 已审核          │      需要用户确认覆盖
      │                                    │               │
      │                                    │               ▼
      │                                    │         弹出确认框
      │                                    │               │
      │                                    │        ┌──────┴──────┐
      │                                    │        ▼             ▼
      │                                    │     确认覆盖      取消
      │                                    │        │
      │                                    │        ▼
      │                                    │  confirmOverwrite
      │                                    │    code: 0
      │                                    │
      └────────────────────────────────────┘

管理员审核处方:
┌─────────┐         review            ┌─────────────┐
│  前端   │ ─────────────────────────> │  后端       │
│         │    id: xxx_待审核          │             │
└─────────┘                           └─────────────┘
      │                                      │
      │                                      ▼
      │                              检查 prescriptionId_已审核
      │                              是否已存在
      │                                      │
      │                      ┌───────────────┼───────────────┐
      │                      ▼               │               ▼
      │                 不存在               │            已存在
      │                      │               │               │
      │                      ▼               │               ▼
      │               直接审核通过            │        needConfirm: true
      │                code: 0              │        需要用户确认覆盖
      │                                        │               │
      │                                        │               ▼
      │                                        │          弹出确认框
      │                                        │               │
      │                                        │        ┌──────┴──────┐
      │                                        │        ▼             ▼
      │                                        │     确认覆盖      取消
      │                                        │        │
      │                                        │        ▼
      │                                        │  confirmApprove
      │                                        │    code: 0
      │
      └────────────────────────────────────────┘
```

### 复合主键机制

处方表使用复合主键格式：`prescriptionId_status`

示例：
- `ABC123_待审核` - 处方ABC123的待审核记录
- `ABC123_已审核` - 处方ABC123的已审核记录

**关键逻辑**：
- 同一个 prescriptionId 可以同时存在"待审核"和"已审核"两条记录
- 普通用户只能看到/操作自己 openid 对应的待审核记录
- 管理员可以操作所有已审核记录

### 边界情况清单

以下场景需要特别关注：

1. **权限边界**
   - 普通用户尝试调用管理员API → 应返回403
   - 管理员尝试操作其他管理员的处方 → 根据业务规则判断

2. **数据一致性**
   - 审核时删除待审核记录，创建已审核记录 → 确保数据不丢失
   - 覆盖时保留缩略图 → 确保 thumbnail 字段正确传递

3. **并发场景**（当前测试未覆盖）
   - 两个管理员同时审核同一处方
   - 用户上传时管理员同时审核

4. **数据格式**
   - 中文键名 vs 英文键名的兼容性
   - medicines 数组的空值处理

---

## 前端场景覆盖分析

### 页面与API调用关系

| 页面 | 用户角色 | 调用的API | 测试覆盖 |
|------|---------|----------|---------|
| login | 全部 | POST /api/login | ⚠️ 需要微信code |
| login | 全部 | POST /api/bind-phone | ✅ |
| home | 全部 | POST /api/check-admin | ✅ |
| booking | 全部 | GET /api/available-slots | ✅ |
| booking | 全部 | GET /api/my-bookings | ✅ |
| booking | 全部 | POST /api/booking | ✅ |
| booking | 全部 | DELETE /api/booking/:id | ✅ |
| prescription | 全部 | POST /api/prescription/ocr | ⚠️ 消耗token |
| prescription | 全部 | POST /api/prescription/save | ✅ |
| prescription | 全部 | POST /api/prescription/confirm-overwrite | ✅ |
| prescription-user | 普通用户 | GET /api/prescription/user-history | ✅ |
| prescription-user | 普通用户 | DELETE /api/prescription/:id | ✅ |
| prescription-admin | 管理员 | GET /api/prescription/list | ✅ |
| prescription-admin | 管理员 | POST /api/prescription/update | ✅ |
| prescription-admin | 管理员 | POST /api/prescription/review | ✅ |
| prescription-admin | 管理员 | POST /api/prescription/confirm-approve | ✅ |
| prescription-review | 管理员 | GET /api/prescription/pending | ✅ |
| prescription-review | 管理员 | POST /api/prescription/review | ✅ |
| prescription-review | 管理员 | POST /api/prescription/confirm-approve | ✅ |
| consultation | 全部 | POST /api/chat | ✅ |

### 关键业务流程测试

#### 流程1: 普通用户上传处方
```
选择图片 → OCR识别 → 保存处方（待审核） → 查看历史
                                    ↓
                              重复上传同一ID → 错误提示
```
**测试覆盖**: ✅ 全覆盖

#### 流程2: 管理员上传处方
```
选择图片 → OCR识别 → 保存处方（已审核） → 完成
                                    ↓
                              重复上传同一ID → code:2 确认覆盖
                                    ↓
                              用户确认 → confirmOverwrite → 完成
```
**测试覆盖**: ✅ 全覆盖

#### 流程3: 管理员审核待审核处方
```
查看待审核列表 → 打开详情 → 审核通过
                              ↓
                    已存在相同ID的已审核记录？
                      ↓               ↓
                     否              是
                      ↓               ↓
                   直接通过      needConfirm: true
                                      ↓
                              用户确认 → confirmApprove → 完成
```
**测试覆盖**: ✅ 全覆盖

#### 流程4: 管理员编辑待审核处方并自动审核
```
打开待审核处方 → 修改内容 → 保存
                              ↓
                     updatePrescription
                              ↓
                     reviewPrescription
                              ↓
                      需要确认覆盖？
                      ↓           ↓
                     否          是
                      ↓           ↓
                   完成      confirmApprove → 完成
```
**测试覆盖**: ✅ 全覆盖（新增测试）

#### 流程5: 批量删除处方
```
进入批量模式 → 选择多个处方 → 确认删除
                              ↓
                      循环调用 DELETE /api/prescription/:id
                              ↓
                           完成
```
**测试覆盖**: ✅ 全覆盖（新增测试）

### 测试用例清单（178个）

| 模块 | 测试数 | 详情 |
|------|--------|------|
| 登录 | 4 | 绑定手机、权限检查(x3) |
| 首页登录 | 6 | 默认超管登录、未注册手机、缺少参数、访问验证、角色设置、普通用户禁止登录 |
| 权限 | 17 | 不同角色访问处方列表/更新/设置角色 |
| 预约 | 31 | 获取日期、业务规则、创建预约、取消预约、场次配置 |
| 处方 | 13 | 保存、历史、列表、更新、删除、审核、双键查询 |
| 库存 | 27 | 药材管理、入库、出库、状态回滚、多维度搜索、权限控制 |
| AI | 1 | 发送消息 |
| 用户管理 | 39 | 更新姓名/手机号、权限验证、数据校验 |
| 数据管理 | 48 | 级联删除、处方状态验证 |
| 系统 | 3 | 健康检查、日志、用户列表 |
| 只读API | 12 | 分页查询、关键词搜索、字段关联 |