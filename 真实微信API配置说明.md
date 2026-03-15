# 真实微信API配置说明

## 已完成的修改

### 1. 后端修改
- ✅ 修改 `services/auth.js`，支持真实微信API调用
- ✅ 添加环境变量配置支持
- ✅ 添加微信API调用函数 `getWechatOpenid()`
- ✅ 修改 `handleLogin()` 函数，自动检测配置并选择真实API或测试模式

### 2. 前端修改
- ✅ 修改 `utils/api.js`，统一openid传递方式
- ✅ 在 `request()` 函数中自动添加openid到所有请求
- ✅ 移除各函数中手动添加openid的代码

### 3. 配置文件
- ✅ 创建 `.env.example` 配置模板
- ✅ 添加 `dotenv` 依赖支持

## 配置步骤

### 1. 获取微信小程序AppId和AppSecret

1. 登录 [微信公众平台](https://mp.weixin.qq.com/)
2. 进入"开发" → "开发设置"
3. 复制你的AppID
4. 重置AppSecret并复制（注意：AppSecret只显示一次）

### 2. 配置环境变量

在 `yifangshun_server` 目录下：

```bash
# 复制配置模板
cp .env.example .env

# 编辑.env文件，填入你的AppId和AppSecret
```

编辑 `.env` 文件：

```env
# 微信小程序AppId
WECHAT_APPID=你的实际AppId

# 微信小程序AppSecret
WECHAT_SECRET=你的实际AppSecret
```

### 3. 安装依赖

```bash
cd yifangshun_server
npm install
```

### 4. 启动服务器

```bash
npm start
```

## 工作原理

### 配置检测

服务器启动时会自动检测是否配置了微信小程序信息：

```javascript
const hasWechatConfig = WECHAT_CONFIG.appid && WECHAT_CONFIG.secret;
```

- **已配置**：使用真实微信API
- **未配置**：使用测试模式（固定openid）

### 真实API流程

```
小程序 → wx.login() → code → 后端API → 微信API → openid
```

### 测试模式流程

```
小程序 → wx.login() → code → 后端API → 固定openid
```

## 前端openid统一传递

### 之前的问题
```javascript
// 有些函数手动添加openid
function savePrescription(data) {
  return request({
    url: '/api/prescription/save',
    data: {
      ...data,
      openid: app.globalData.openid // 手动添加
    }
  });
}

// 有些函数没有添加openid
function getHistory() {
  return request({
    url: '/api/prescription/history'
    // 没有openid
  });
}
```

### 现在的解决方案
```javascript
// request函数自动添加openid
function request(options) {
  // 自动添加openid到请求中
  if (options.data && options.method === 'POST' && !options.data.openid) {
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    if (openid) {
      options.data.openid = openid;
    }
  }
  
  // 对于GET请求，将openid添加到query参数中
  if ((options.method === 'GET' || !options.method) && options.data && !options.data.openid) {
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    if (openid) {
      options.data.openid = openid;
    }
  }
  
  // ... 其他逻辑
}
```

### 使用方式
```javascript
// 现在所有函数都不需要手动添加openid
function savePrescription(data) {
  return request({
    url: '/api/prescription/save',
    data: data // openid会自动添加
  });
}

function getHistory() {
  return request({
    url: '/api/prescription/history',
    data: {} // openid会自动添加
  });
}
```

## 测试建议

### 1. 先在测试模式验证
不配置AppId和AppSecret，使用测试模式验证基本功能：

```bash
# 不配置.env文件，直接启动
npm start
```

### 2. 再切换到真实API
配置AppId和AppSecret，验证真实微信登录：

```bash
# 配置.env文件后启动
npm start
```

### 3. 对比测试
- 测试模式：所有用户使用相同openid `test_user_openid_001`
- 真实模式：每个用户有独立的openid

## 注意事项

1. **AppSecret安全性**：
   - AppSecret是敏感信息，不要提交到代码仓库
   - 生产环境应该使用环境变量或配置中心
   - 定期更换AppSecret

2. **openid一致性**：
   - 真实环境下，同一个用户的openid不会改变
   - 测试环境下，固定openid便于调试

3. **错误处理**：
   - 微信API调用失败会返回详细错误信息
   - 检查AppId和AppSecret是否正确配置
   - 检查网络连接是否正常

## 故障排查

### 问题1：调用微信API失败
**错误信息**：`微信API错误: 40029 - invalid code`

**原因**：
- code已过期（5分钟有效期）
- code已被使用
- AppId或AppSecret配置错误

**解决**：
- 确认AppId和AppSecret正确
- 检查code是否在有效期内
- 确保每次登录都使用新的code

### 问题2：未配置微信小程序信息
**警告信息**：`未配置微信小程序AppId和AppSecret，将使用测试模式登录`

**解决**：
- 配置.env文件
- 填入正确的AppId和AppSecret
- 重启服务器

### 问题3：openid传递失败
**现象**：后端提示"缺少openid"

**原因**：
- 前端未登录
- openid未正确保存到storage

**解决**：
- 确保用户已登录
- 检查`app.globalData.openid`和`wx.getStorageSync('openid')`

## 真实环境部署检查清单

- [ ] 配置AppId和AppSecret
- [ ] 安装所有依赖
- [ ] 测试登录流程
- [ ] 验证openid一致性
- [ ] 检查错误处理
- [ ] 确认session管理正常
- [ ] 测试所有API接口
- [ ] 验证权限控制