// 加载环境变量
require('dotenv').config();

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const morgan = require("morgan");
const fs = require("fs");
const path = require("path");
const { init: initDB, User, Booking, ChatMessage, Prescription, sequelize, Op,
  Herb, StockInOrder, StockInItem, StockOutOrder, StockOutItem,
  StockInventory, StockLog, ScheduleConfig  // 新增
} = require("./wrappers/db-wrapper");

// 导入 service 模块
const auth = require("./services/auth");
const booking = require("./services/booking");
const prescription = require("./services/prescription");
const chat = require("./services/chat");
const stock = require("./services/stock");
const schedule = require("./services/schedule");  // 新增

// 导入工具函数
const { convertCloudFileIdToUrl } = require("./services/prescription");

// 导入权限中间件
const { requireRole } = require("./middlewares/auth");

const logger = morgan("tiny");

const app = express();
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(cors());
app.use(logger);

// 静态文件服务（排除 index.html，由路由处理）
const staticMiddleware = express.static(path.join(__dirname, 'public'));
app.use((req, res, next) => {
  // 如果是根路径，跳过静态服务，让路由处理
  if (req.path === '/' || req.path === '/index.html') {
    return next();
  }
  staticMiddleware(req, res, next);
});

// 首页 - 返回用户列表数据（前端通过AJAX获取）
app.get("/api/home/users", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const keyword = req.query.keyword || '';
    
    // 构建查询条件
    const whereClause = {
      phone: { [Op.ne]: null }
    };
    
    // 添加搜索条件
    if (keyword) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${keyword}%` } },
        { phone: { [Op.like]: `%${keyword}%` } }
      ];
    }
    
    // 获取总数
    const totalCount = await User.count({ where: whereClause });
    const totalPages = Math.ceil(totalCount / pageSize);
    
    // 获取分页数据
    const users = await User.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize
    });

    res.json({
      code: 0,
      data: {
        list: users.map(user => ({
          openid: user.openid,
          name: user.name,
          phone: user.phone,
          role: user.role,
          createdAt: user.createdAt
        })),
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages
        }
      }
    });
  } catch (error) {
    console.error("获取用户列表失败:", error);
    res.status(500).json({ code: 1, message: error.message || "获取用户列表失败" });
  }
});

// 设置用户角色（admin 可以设置除 super_admin 外的角色，super_admin 无限制）
app.post("/api/user/set-role", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { openid: targetOpenid, role: newRole } = req.body;
    const operatorOpenid = req.user.openid || 'system';
    // 如果是 home_super_admin 或 super_admin，跳过操作者验证
    const isHomeSuperAdmin = req.user.phone === 'home_super_admin';
    const isSuperAdmin = req.user.role === 'super_admin';
    
    // admin 不能设置用户为 super_admin
    if (req.user.role === 'admin' && newRole === 'super_admin') {
      return res.status(403).json({ code: 1, message: '管理员无权设置超级管理员' });
    }
    
    const result = await auth.setUserRole(targetOpenid, newRole, operatorOpenid, isHomeSuperAdmin || isSuperAdmin, req.user.role);
    res.json(result);
  } catch (error) {
    console.error("设置用户角色失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "设置用户角色失败" });
  }
});

// 更新用户信息（姓名、手机号）- admin 和 super_admin 都可以
app.put("/api/user/:openid", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { openid } = req.params;
    const { name, phone } = req.body;
    
    const result = await auth.updateUserInfo(openid, name, phone);
    res.json(result);
  } catch (error) {
    console.error("更新用户信息失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "更新用户信息失败" });
  }
});

// 首页 - 返回HTML页面
app.get("/", (req, res) => {
  const phoneNumber = req.query.phone_number;
  
  // 如果没有 phone_number 参数，重定向到登录页
  if (!phoneNumber) {
    return res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }
  
  // 如果有 phone_number 参数，返回主页面
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== 登录相关接口 ====================

// 微信授权登录
app.post("/api/login", async (req, res) => {
  try {
    const { code } = req.body;
    const result = await auth.handleLogin(code);
    res.json(result);
  } catch (error) {
    console.error("登录失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "登录失败" });
  }
});

// 检查用户是否为管理员
app.post("/api/check-admin", async (req, res) => {
  try {
    const { openid } = req.body;
    const result = await auth.checkIsAdmin(openid);
    res.json(result);
  } catch (error) {
    console.error("检查管理员状态失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "检查管理员状态失败" });
  }
});

// 绑定手机号和姓名（首次登录）
app.post("/api/bind-user-info", async (req, res) => {
  try {
    const { openid, name, phone } = req.body;
    const result = await auth.handleBindUserInfo(openid, name, phone);
    res.json(result);
  } catch (error) {
    console.error("绑定用户信息失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "绑定失败" });
  }
});

// 绑定手机号
app.post("/api/bind-phone", async (req, res) => {
  try {
    const { openid, phone } = req.body;
    const result = await auth.handleBindPhone(openid, phone);
    res.json(result);
  } catch (error) {
    console.error("绑定手机号失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "绑定失败" });
  }
});

// ==================== 首页登录接口 ====================

// 首页管理员登录（通过手机号）
app.post("/api/home-login", async (req, res) => {
  try {
    const { phone } = req.body;
    
    if (!phone) {
      return res.status(400).json({ code: 1, message: '缺少手机号参数' });
    }
    
    // 【特殊处理】默认超级管理员手机号（无需数据库）
    if (phone === 'home_super_admin') {
      return res.json({
        code: 0,
        message: '登录成功',
        data: {
          openid: 'home_super_admin',
          phone: 'home_super_admin',
          role: 'super_admin',
          name: '超级管理员',
          isHomeAdmin: true
        }
      });
    }
    
    // 查询用户信息
    const user = await User.findOne({ where: { phone } });
    
    if (!user) {
      return res.status(404).json({ 
        code: 1, 
        message: '该手机号未注册，请先在系统中添加用户' 
      });
    }
    
    // 检查是否为管理员或超级管理员（禁止普通用户登录）
    if (!['admin', 'super_admin'].includes(user.role)) {
      return res.status(403).json({ 
        code: 1, 
        message: '普通用户禁止登录管理后台' 
      });
    }
    
    res.json({
      code: 0,
      message: '登录成功',
      data: {
        openid: user.openid,
        phone: user.phone,
        role: user.role,
        name: user.name
      }
    });
    
  } catch (error) {
    console.error("首页登录失败:", error);
    return res.status(500).json({ code: 1, message: error.message || "登录失败" });
  }
});

// ==================== 角色管理接口 ====================

// ==================== 预约相关接口 ====================

// 获取可预约日期
app.get("/api/available-slots", async (req, res) => {
  try {
    const { startDate, openid } = req.query;
    const result = await booking.getAvailableSlots(startDate, openid);
    res.json(result);
  } catch (error) {
    console.error("获取可预约日期失败:", error);
    return res.status(500).json({ code: 1, message: "获取可预约日期失败" });
  }
});

// 创建预约 - 支持场次和人数（需要登录）
app.post("/api/booking", requireRole(['user', 'admin', 'super_admin']), async (req, res) => {
  try {
    const { date, session, personCount } = req.body;
    // 【手机号改造】使用 req.user.phone 而非 openid
    const result = await booking.createBooking(date, session, personCount, req.user);
    res.json(result);
  } catch (error) {
    console.error("创建预约失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "创建预约失败" });
  }
});

// 取消预约（需要登录）
app.delete("/api/booking/:id", requireRole(['user', 'admin', 'super_admin']), async (req, res) => {
  try {
    const { id } = req.params;
    // 【手机号改造】使用 req.user.phone 而非 openid
    const result = await booking.cancelBooking(id, req.user);
    res.json(result);
  } catch (error) {
    console.error("取消预约失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "取消预约失败" });
  }
});

// 获取我的预约（需要登录）
app.get("/api/my-bookings", requireRole(['user', 'admin', 'super_admin']), async (req, res) => {
  try {
    // 【手机号改造】使用 req.user.phone 而非 openid
    const result = await booking.getMyBookings(req.user.phone);
    res.json(result);
  } catch (error) {
    console.error("获取我的预约失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "获取我的预约失败" });
  }
});



// ==================== 处方识别接口 ====================

// 处方OCR识别
app.post("/api/prescription/ocr", async (req, res) => {
  try {
    const { image, openid } = req.body;
    const result = await prescription.handlePrescriptionOCR(image, openid);
    res.json(result);
  } catch (error) {
    console.error("处方识别失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "处方识别失败，请稍后重试" });
  }
});

// 获取处方历史
app.get("/api/prescription/user-history", requireRole(['user', 'admin', 'super_admin']), async (req, res) => {
  try {
    // 【手机号改造】使用 req.user.phone 而非 openid
    const result = await prescription.getPrescriptionHistory(req.user.phone);
    res.json(result);
  } catch (error) {
    console.error("获取处方历史失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "获取处方历史失败" });
  }
});

// 保存处方
app.post("/api/prescription/save", async (req, res) => {
  try {
    const { openid, thumbnail, skipValidation, ...prescriptionData } = req.body;
    const result = await prescription.savePrescription(prescriptionData, openid, thumbnail, false, skipValidation);
    res.json(result);
  } catch (error) {
    console.error("保存处方失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "保存处方失败，请稍后重试" });
  }
});

// 更新处方
app.post("/api/prescription/update", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { prescriptionId, status, thumbnail, ...prescriptionData } = req.body;
    
    if (!prescriptionId || !status) {
      return res.status(400).json({ code: 1, message: "缺少处方ID或状态" });
    }
    
    const result = await prescription.updatePrescription(prescriptionId, status, prescriptionData, thumbnail);
    res.json(result);
  } catch (error) {
    console.error("更新处方失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "更新处方失败，请稍后重试" });
  }
});

// 删除处方 - 双键 URL（需要登录）
app.delete("/api/prescription/:prescriptionId/:status", requireRole(['user', 'admin', 'super_admin']), async (req, res) => {
  try {
    console.log("删除处方路由 - req.user:", req.user);
    const { prescriptionId, status } = req.params;
    // 【手机号改造】使用 req.user 而非 openid
    const result = await prescription.deletePrescription(prescriptionId, status, req.user);
    res.json(result);
  } catch (error) {
    console.error("删除处方失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "删除处方失败，请稍后重试" });
  }
});

// 审核处方
app.post("/api/prescription/review", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { prescriptionId, status, action } = req.body;
    
    if (!prescriptionId || !status || !action) {
      return res.status(400).json({ code: 1, message: "缺少必要参数" });
    }

    const reviewerName = req.user.name || req.user.openid;
    const result = await prescription.reviewPrescription(prescriptionId, status, action, req.user.openid, reviewerName);
    res.json(result);
  } catch (error) {
    console.error("审核处方失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "审核处方失败" });
  }
});

// 确认审核通过（覆盖旧记录）
app.post("/api/prescription/confirm-approve", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { prescriptionId, status } = req.body;
    
    if (!prescriptionId || !status) {
      return res.status(400).json({ code: 1, message: "缺少处方ID或状态" });
    }

    const reviewerName = req.user.name || req.user.openid;
    const result = await prescription.confirmPrescriptionApprove(prescriptionId, status, req.user.openid, reviewerName);
    res.json(result);
  } catch (error) {
    console.error("确认审核失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "确认审核失败" });
  }
});

// 确认覆盖已存在的处方（管理员上传重复处方时使用）
app.post("/api/prescription/confirm-overwrite", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { prescriptionId, prescriptionData, thumbnail } = req.body;
    const openid = req.user.openid;
    
    if (!prescriptionId || !prescriptionData) {
      return res.status(400).json({ code: 1, message: "缺少必要参数" });
    }

    const result = await prescription.confirmOverwritePrescription(prescriptionId, prescriptionData, thumbnail, openid);
    res.json(result);
  } catch (error) {
    console.error("确认覆盖处方失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "确认覆盖处方失败" });
  }
});

// 获取所有处方列表（管理员）
app.get("/api/prescription/list", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword = '', status = 'all' } = req.query;
    
    // 每次都执行清理（内部已有检查逻辑，不会有性能问题）
    const cleanResult = await prescription.cleanExpiredPrescriptions();
    
    const result = await prescription.getPrescriptionsList({ 
      page: parseInt(page), 
      pageSize: parseInt(pageSize),
      keyword,
      status
    });
    
    // 如果有清理结果，附加到响应中
    if (cleanResult.count > 0) {
      result.cleaned = cleanResult;
    }
    
    res.json(result);
  } catch (error) {
    console.error("获取处方列表失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "获取处方列表失败" });
  }
});

// ==================== AI咨询接口 ====================

// AI聊天
app.post("/api/chat", async (req, res) => {
  try {
    const { message, openid } = req.body;
    if (!message) {
      return res.status(400).json({ code: 1, message: "消息内容不能为空" });
    }

    // 模拟延迟1-2秒
    setTimeout(async () => {
      try {
        // handleChat 内部会自动保存用户消息和机器人回复
        const result = await chat.handleChat(message, openid);
        res.json(result);
      } catch (error) {
        console.error("AI聊天失败:", error);
        res.status(500).json({ code: 1, message: "AI聊天失败" });
      }
    }, 1000 + Math.random() * 1000);
  } catch (error) {
    console.error("AI聊天失败:", error);
    return res.status(500).json({ code: 1, message: "AI聊天失败" });
  }
});

// ==================== 数据库管理接口（仅超级管理员） ====================

// 更新主表总价（根据明细汇总）
async function updateOrderTotalAmount(orderTable, itemTable, orderId) {
  try {
    const OrderModel = TABLE_MODELS[orderTable];
    const ItemModel = TABLE_MODELS[itemTable];
    
    if (!OrderModel || !ItemModel) return;
    
    // 获取所有明细
    const items = await ItemModel.findAll({ where: { orderId } });
    
    // 计算总价
    let totalAmount = 0;
    items.forEach(item => {
      totalAmount += parseFloat(item.totalPrice) || 0;
    });
    
    // 执药单用的是 totalPrice，其他表用 totalAmount
    const fieldName = orderTable === 'stock_out_orders' ? 'totalPrice' : 'totalAmount';
    await OrderModel.update({ [fieldName]: totalAmount }, { where: { id: orderId } });
  } catch (error) {
    console.error('更新主表总价失败:', error);
  }
}

// 表名与模型的映射
const TABLE_MODELS = {
  'users': User,
  'bookings': Booking,
  'chat_messages': ChatMessage,
  'prescriptions': Prescription,
  // 库存管理相关表
  'herbs': Herb,
  'stock_in_orders': StockInOrder,
  'stock_in_items': StockInItem,
  'stock_out_orders': StockOutOrder,
  'stock_out_items': StockOutItem,
  'stock_inventory': StockInventory,
  'stock_logs': StockLog
};

// 表的中文名称
const TABLE_NAMES = {
  'users': '用户表',
  'bookings': '预约表',
  'chat_messages': '聊天消息表',
  'prescriptions': '处方表',
  // 库存管理相关表
  'herbs': '药材表',
  'stock_in_orders': '入库单表',
  'stock_in_items': '入库明细表',
  'stock_out_orders': '执药单表',
  'stock_out_items': '执药明细表',
  'stock_inventory': '库存表',
  'stock_logs': '操作日志表'
};

// 获取所有表的状态
app.get("/api/admin/tables", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const tables = [];
    
    for (const [name, model] of Object.entries(TABLE_MODELS)) {
      try {
        const count = await model.count();
        tables.push({
          name,
          displayName: TABLE_NAMES[name] || name,
          exists: true,
          count
        });
      } catch (error) {
        // 表不存在或读取失败
        tables.push({
          name,
          displayName: TABLE_NAMES[name] || name,
          exists: false,
          count: 0,
          error: error.message
        });
      }
    }
    
    res.json({ code: 0, data: tables });
  } catch (error) {
    console.error("获取表状态失败:", error);
    res.status(500).json({ code: 1, message: error.message || "获取表状态失败" });
  }
});

// 获取指定表的数据（分页 + 多维度搜索）
app.get("/api/admin/table/:name", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { name } = req.params;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const keyword = (req.query.keyword || '').trim();
    
    const model = TABLE_MODELS[name];
    if (!model) {
      return res.status(404).json({ code: 1, message: "表不存在" });
    }
    
    // 获取所有数据
    let allData = await model.findAll({
      order: [['createdAt', 'DESC']],
      raw: true  // 返回纯JSON数据，而不是Sequelize模型实例
    });
    
    // 对于bookings表，关联用户信息（姓名和手机号）
    if (name === 'bookings') {
      const openids = [...new Set(allData.map(row => row.openid).filter(Boolean))];
      if (openids.length > 0) {
        const users = await User.findAll({
          where: { openid: { [Op.in]: openids } },
          raw: true
        });
        const userMap = {};
        users.forEach(u => { userMap[u.openid] = u; });
        allData = allData.map(row => ({
          ...row,
          name: userMap[row.openid]?.name || '',
          phone: userMap[row.openid]?.phone || ''
        }));
      }
    }
    
    // 处方表：转换缩略图 URL
    if (name === 'prescriptions') {
      allData = allData.map(row => ({
        ...row,
        thumbnail: row.thumbnail ? convertCloudFileIdToUrl(row.thumbnail) : null
      }));
    }
    
    // 执药明细表：查询药材柜号
    if (name === 'stock_out_items') {
      const { Herb } = require('./wrappers/db-wrapper');
      allData = await Promise.all(allData.map(async (row) => {
        const herb = await Herb.findOne({ where: { name: row.herbName } });
        return {
          ...row,
          cabinetNo: herb ? herb.cabinetNo || '' : ''
        };
      }));
    }
    
    // 多维度搜索
    if (keyword) {
      const keywordLower = keyword.toLowerCase();
      allData = allData.filter(row => {
        // 遍历所有字段进行匹配
        for (const key in row) {
          const value = row[key];
          if (value !== null && value !== undefined) {
            const strValue = String(value).toLowerCase();
            if (strValue.includes(keywordLower)) {
              return true;
            }
          }
        }
        return false;
      });
    }
    
    const totalCount = allData.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    
    // 分页
    const start = (page - 1) * pageSize;
    const rows = allData.slice(start, start + pageSize);
    
    res.json({
      code: 0,
      data: {
        rows,
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages
        }
      }
    });
  } catch (error) {
    console.error("获取表数据失败:", error);
    res.status(500).json({ code: 1, message: error.message || "获取表数据失败" });
  }
});

// 清空指定表
app.delete("/api/admin/table/:name", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { name } = req.params;
    const confirm = req.query.confirm === 'true';
    
    if (!confirm) {
      return res.status(400).json({ code: 1, message: "请确认清空操作（添加 ?confirm=true）" });
    }
    
    const model = TABLE_MODELS[name];
    if (!model) {
      return res.status(404).json({ code: 1, message: "表不存在" });
    }
    
    const deletedCount = await model.destroy({ truncate: true });
    
    res.json({
      code: 0,
      message: `已清空表 ${TABLE_NAMES[name] || name}，删除了 ${deletedCount} 条记录`
    });
  } catch (error) {
    console.error("清空表失败:", error);
    res.status(500).json({ code: 1, message: error.message || "清空表失败" });
  }
});

// 获取指定表的单条记录
app.get("/api/admin/table/:name/:id", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { name, id } = req.params;
    
    const model = TABLE_MODELS[name];
    if (!model) {
      return res.status(404).json({ code: 1, message: "表不存在" });
    }
    
    const record = await model.findOne({ where: { id } });
    if (!record) {
      return res.status(404).json({ code: 1, message: "记录不存在" });
    }
    
    // 处理Sequelize实例
    const data = record.toJSON ? record.toJSON() : record;
    res.json({ code: 0, data });
  } catch (error) {
    console.error("获取记录失败:", error);
    res.status(500).json({ code: 1, message: error.message || "获取记录失败" });
  }
});

// 初始化指定表（如果不存在）
app.post("/api/admin/table/:name/init", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { name } = req.params;
    
    const model = TABLE_MODELS[name];
    if (!model) {
      return res.status(404).json({ code: 1, message: "表不存在" });
    }
    
    // 尝试创建一条空记录来初始化表
    await model.count();
    
    res.json({ code: 0, message: `表 ${TABLE_NAMES[name] || name} 已就绪` });
  } catch (error) {
    console.error("初始化表失败:", error);
    res.status(500).json({ code: 1, message: error.message || "初始化表失败" });
  }
});

// 新增记录
app.post("/api/admin/table/:name", requireRole(['admin', 'super_admin'], true), async (req, res) => {
  try {
    const { name } = req.params;
    const recordData = req.body;
    
    const model = TABLE_MODELS[name];
    if (!model) {
      return res.status(404).json({ code: 1, message: "表不存在" });
    }
    
    // 移除不允许直接设置的字段
    delete recordData.id;
    delete recordData.createdAt;
    delete recordData.updatedAt;
    
    const newRecord = await model.create(recordData);
    
    // 如果是入库明细，更新入库单总价
    if (name === 'stock_in_items' && recordData.orderId) {
      await updateOrderTotalAmount('stock_in_orders', 'stock_in_items', recordData.orderId);
    }
    // 如果是执药明细，更新执药单总价
    if (name === 'stock_out_items' && recordData.orderId) {
      await updateOrderTotalAmount('stock_out_orders', 'stock_out_items', recordData.orderId);
    }
    
    res.json({ code: 0, message: "新增成功", data: newRecord });
  } catch (error) {
    console.error("新增记录失败:", error);
    res.status(500).json({ code: 1, message: error.message || "新增记录失败" });
  }
});

// 更新记录
app.put("/api/admin/table/:name/:id", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { name, id } = req.params;
    const updates = req.body;
    
    const model = TABLE_MODELS[name];
    if (!model) {
      return res.status(404).json({ code: 1, message: "表不存在" });
    }
    
    // 检查记录是否存在
    const record = await model.findOne({ where: { id } });
    if (!record) {
      return res.status(404).json({ code: 1, message: "记录不存在" });
    }
    
    // 如果是处方表，检查是否为已结算状态
    if (name === 'prescriptions' && record.status === '已结算') {
      return res.status(400).json({ code: 1, message: "已结算处方不可编辑" });
    }
    
    // 如果是入库单，检查状态
    if (name === 'stock_in_orders') {
      // 已入库状态：只允许修改状态字段（用于回滚），忽略其他字段
      if (record.status === 'stocked') {
        const newStatus = updates.status;
        Object.keys(updates).forEach(key => delete updates[key]);
        if (newStatus) {
          updates.status = newStatus;
        }
      }
    }
    
    // 如果是入库明细，检查入库单状态
    if (name === 'stock_in_items' && record.orderId) {
      const order = await StockInOrder.findOne({ where: { id: record.orderId } });
      if (order && order.status === 'stocked') {
        return res.status(400).json({ code: 1, message: "已入库的单据明细不能修改" });
      }
    }
    
    // 如果是执药单，检查状态
    if (name === 'stock_out_orders') {
      // 已结算状态禁止编辑
      if (record.status === 'settled') {
        return res.status(400).json({ code: 1, message: "已结算执药单不可编辑，请使用撤销功能" });
      }
      // 禁止直接修改status字段（应使用专用接口）
      if (updates.status) {
        return res.status(400).json({ code: 1, message: "执药单状态不能直接修改，请使用结算/撤销功能" });
      }
    }
    
    // 如果是执药明细，检查执药单状态
    if (name === 'stock_out_items' && record.orderId) {
      const order = await StockOutOrder.findOne({ where: { id: record.orderId } });
      if (order && order.status === 'settled') {
        return res.status(400).json({ code: 1, message: "已结算执药单明细不能修改" });
      }
    }
    
    // 受保护字段：不允许修改
    const protectedFields = ['id', 'openid', 'createdAt'];
    protectedFields.forEach(field => delete updates[field]);
    
    // 【权限控制】如果是 users 表，admin 不能修改 role 字段为 super_admin
    if (name === 'users' && req.user.role === 'admin') {
      // 如果尝试修改 role 字段
      if (updates.role) {
        // admin 不能设置 super_admin 角色
        if (updates.role === 'super_admin') {
          return res.status(403).json({ code: 1, message: '管理员无权设置超级管理员' });
        }
        // admin 只能将角色降级或设置为 admin/user
        if (!['user', 'admin'].includes(updates.role)) {
          return res.status(403).json({ code: 1, message: '管理员无权设置此角色' });
        }
      }
    }
    
    // 执行更新
    await model.update(updates, { where: { id } });
    
    // 返回更新后的记录
    const updatedRecord = await model.findOne({ where: { id } });
    
    // 处方表状态变化时自动创建/删除执药单
    if (name === 'prescriptions') {
      // 待审核 → 已审核：创建执药单
      if (updates.status === '已审核' && record.status === '待审核') {
        try {
          // 解析处方数据
          const prescriptionData = JSON.parse(record.data);
          const targetPrescriptionId = prescriptionData.prescriptionId || record.prescriptionId;
          
          // 检查是否已存在该处方的执药单
          const existingOrder = await StockOutOrder.findOne({ where: { prescriptionId: targetPrescriptionId } });
          if (!existingOrder) {
            // 从处方数据中提取药材明细
            const medicines = prescriptionData.medicines || prescriptionData['药方'] || [];
            if (medicines.length > 0) {
              const now = new Date().toISOString();
              // 创建执药单主记录
              const outOrder = await StockOutOrder.create({
                prescriptionId: targetPrescriptionId,
                prescriptionTime: record.prescriptionDate || now,
                pharmacist: '',
                reviewer: record.reviewer || '',  // 从处方记录获取审核人
                status: 'pending',
                remark: '处方审核通过自动生成',
                totalAmount: 0,
                createdAt: now,
                updatedAt: now
              });
              
              // 获取剂数
              const dosage = parseInt(prescriptionData.dosage) || 1;
              
              // 创建执药明细
              for (const med of medicines) {
                const herbName = med.name || med['药名'] || '';
                const singleDose = parseFloat(med.quantity || med['数量'] || 0);
                const quantity = singleDose * dosage;  // 总克数 = 单剂量 × 剂数
                
                if (herbName && quantity > 0) {
                  // 获取药材售价
                  const herb = await Herb.findOne({ where: { name: herbName } });
                  const unitPrice = herb ? (herb.salePrice || 0) : 0;
                  
                  await StockOutItem.create({
                    orderId: outOrder.id,
                    herbName,
                    quantity,
                    unitPrice,
                    totalPrice: quantity * unitPrice,
                    createdAt: now
                  });
                }
              }
              
              console.log('[PUT处方审核] 自动创建执药单成功:', outOrder.id, '处方ID:', targetPrescriptionId);
            }
          }
        } catch (err) {
          console.error('[PUT处方审核] 创建执药单失败:', err.message);
        }
      }
      
      // 已审核 → 待审核：删除执药单（仅限待执药状态）
      if (updates.status === '待审核' && record.status === '已审核') {
        try {
          const prescriptionData = JSON.parse(record.data);
          const targetPrescriptionId = prescriptionData.prescriptionId || record.prescriptionId;
          
          // 查找对应执药单
          const existingOrder = await StockOutOrder.findOne({ where: { prescriptionId: targetPrescriptionId } });
          if (existingOrder) {
            // 只有待执药状态才能删除
            if (existingOrder.status === 'pending') {
              // 先删除明细
              await StockOutItem.destroy({ where: { orderId: existingOrder.id } });
              // 再删除主表
              await StockOutOrder.destroy({ where: { id: existingOrder.id } });
              console.log('[PUT处方取消审核] 删除执药单成功:', existingOrder.id, '处方ID:', targetPrescriptionId);
            } else {
              console.log('[PUT处方取消审核] 执药单已结算，不删除:', existingOrder.id);
            }
          }
        } catch (err) {
          console.error('[PUT处方取消审核] 删除执药单失败:', err.message);
        }
      }
    }
    
    // 更新入库单总价
    if (name === 'stock_in_items' && record.orderId) {
      await updateOrderTotalAmount('stock_in_orders', 'stock_in_items', record.orderId);
    }
    // 更新执药单总价
    if (name === 'stock_out_items' && record.orderId) {
      await updateOrderTotalAmount('stock_out_orders', 'stock_out_items', record.orderId);
    }
    
    res.json({ code: 0, message: "更新成功", data: updatedRecord });
  } catch (error) {
    console.error("更新记录失败:", error);
    res.status(500).json({ code: 1, message: error.message || "更新记录失败" });
  }
});

// 删除记录
app.delete("/api/admin/table/:name/:id", requireRole(['admin', 'super_admin'], true), async (req, res) => {
  try {
    const { name, id } = req.params;
    
    const model = TABLE_MODELS[name];
    if (!model) {
      return res.status(404).json({ code: 1, message: "表不存在" });
    }
    
    // 检查记录是否存在
    const record = await model.findOne({ where: { id } });
    if (!record) {
      return res.status(404).json({ code: 1, message: "记录不存在" });
    }
    
    // 已入库/已结算状态的单据不能删除
    if (name === 'stock_in_orders' && record.status === 'stocked') {
      return res.status(400).json({ code: 1, message: "已入库单据不能删除" });
    }
    if (name === 'stock_out_orders' && record.status === 'settled') {
      return res.status(400).json({ code: 1, message: "已结算执药单不能删除，请使用撤销功能" });
    }
    
    // 级联删除：删除入库单时同步删除入库明细
    if (name === 'stock_in_orders') {
      const detailCount = await StockInItem.count({ where: { orderId: id } });
      if (detailCount > 0) {
        await StockInItem.destroy({ where: { orderId: id } });
      }
    }
    
    // 级联删除：删除执药单时同步删除执药明细
    if (name === 'stock_out_orders') {
      const detailCount = await StockOutItem.count({ where: { orderId: id } });
      if (detailCount > 0) {
        await StockOutItem.destroy({ where: { orderId: id } });
      }
    }
    
    // 级联删除：删除盘点单时同步删除盘点明细
    // 记录orderId用于更新总价
    const orderId = record.orderId;
    
    // 执行删除
    const deletedCount = await model.destroy({ where: { id } });
    
    // 如果是入库明细，更新入库单总价
    if (name === 'stock_in_items' && orderId) {
      await updateOrderTotalAmount('stock_in_orders', 'stock_in_items', orderId);
    }
    // 如果是执药明细，更新执药单总价
    if (name === 'stock_out_items' && orderId) {
      await updateOrderTotalAmount('stock_out_orders', 'stock_out_items', orderId);
    }
    
    res.json({ code: 0, message: "删除成功", data: { deletedCount } });
  } catch (error) {
    console.error("删除记录失败:", error);
    res.status(500).json({ code: 1, message: error.message || "删除记录失败" });
  }
});

// 批量删除记录
app.post("/api/admin/table/:name/batch-delete", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { name } = req.params;
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ code: 1, message: "请选择要删除的记录" });
    }
    
    const model = TABLE_MODELS[name];
    if (!model) {
      return res.status(404).json({ code: 1, message: "表不存在" });
    }
    
    // 执行批量删除
    let deletedCount = 0;
    for (const id of ids) {
      // 级联删除：删除入库单时同步删除入库明细
      if (name === 'stock_in_orders') {
        await StockInItem.destroy({ where: { orderId: id } });
      }
      // 级联删除：删除执药单时同步删除执药明细
      if (name === 'stock_out_orders') {
        await StockOutItem.destroy({ where: { orderId: id } });
      }
      
      const count = await model.destroy({ where: { id } });
      deletedCount += count;
    }
    
    res.json({ code: 0, message: `成功删除 ${deletedCount} 条记录`, data: { deletedCount } });
  } catch (error) {
    console.error("批量删除失败:", error);
    res.status(500).json({ code: 1, message: error.message || "批量删除失败" });
  }
});

// ==================== 库存管理接口 ====================

// 药材管理
app.get("/api/stock/herbs", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const result = await stock.getHerbs(req.query);
    res.json(result);
  } catch (error) {
    res.status(400).json({ code: 1, message: error.message });
  }
});

app.post("/api/stock/herbs", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const result = await stock.createHerb(req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ code: 1, message: error.message });
  }
});

app.put("/api/stock/herbs/:id", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const result = await stock.updateHerb(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ code: 1, message: error.message });
  }
});

app.delete("/api/stock/herbs/:id", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const result = await stock.deleteHerb(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ code: 1, message: error.message });
  }
});

// 入库管理
app.get("/api/stock/in/orders", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const result = await stock.getInOrders(req.query);
    res.json(result);
  } catch (error) {
    res.status(400).json({ code: 1, message: error.message });
  }
});

app.get("/api/stock/in/orders/:id", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const result = await stock.getInOrderById(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ code: 1, message: error.message });
  }
});

app.post("/api/stock/in/orders", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const result = await stock.createInOrder(req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ code: 1, message: error.message });
  }
});

app.put("/api/stock/in/orders/:id", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const result = await stock.updateInOrder(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ code: 1, message: error.message });
  }
});

app.delete("/api/stock/in/orders/:id", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const result = await stock.deleteInOrder(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ code: 1, message: error.message });
  }
});

app.post("/api/stock/in/orders/:id/confirm", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const result = await stock.confirmInOrder(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ code: 1, message: error.message });
  }
});

app.post("/api/stock/in/orders/:id/stock", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const operator = req.user?.openid || 'system';
    const result = await stock.executeStockIn(req.params.id, operator);
    res.json(result);
  } catch (error) {
    res.status(400).json({ code: 1, message: error.message });
  }
});

// 入库单状态更新（确认入库/退回草稿）
app.put("/api/stock/in/orders/:id/status", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const operator = req.user?.openid || 'system';

    if (status === 'stocked') {
      // 确认入库
      const result = await stock.executeStockIn(id, operator);
      res.json(result);
    } else if (status === 'draft') {
      // 退回草稿 - 先回退库存，再更新状态
      const result = await stock.revertStockIn(id, operator);
      if (result.code === 0) {
        // 直接更新订单状态为草稿
        await StockInOrder.update({ status: 'draft', updatedAt: new Date().toISOString() }, { where: { id } });
        res.json({ code: 0, message: '已退回草稿' });
      } else {
        res.json(result);
      }
    } else {
      res.status(400).json({ code: 1, message: '无效的状态' });
    }
  } catch (error) {
    res.status(400).json({ code: 1, message: error.message });
  }
});

// 出库管理
app.get("/api/stock/out/orders", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const result = await stock.getOutOrders(req.query);
    res.json(result);
  } catch (error) {
    res.status(400).json({ code: 1, message: error.message });
  }
});

app.post("/api/stock/out/orders", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const operator = req.user?.name || req.user?.openid || 'system';
    const result = await stock.createOutOrder(req.body, operator);
    res.json(result);
  } catch (error) {
    res.status(400).json({ code: 1, message: error.message });
  }
});

app.delete("/api/stock/out/orders/:id", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const result = await stock.deleteOutOrder(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ code: 1, message: error.message });
  }
});

// 获取单个执药单（包含明细）
app.get("/api/stock/out/orders/:id", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const result = await stock.getOutOrderById(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ code: 1, message: error.message });
  }
});

// 撤销执药单（回滚库存）
app.post("/api/stock/out/orders/:id/revert", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const operator = req.user?.name || req.user?.openid || 'system';
    const result = await stock.revertOutOrder(req.params.id, operator);
    res.json(result);
  } catch (error) {
    res.status(400).json({ code: 1, message: error.message });
  }
});

// 结算执药单
app.post("/api/stock/out/orders/:id/settle", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const result = await stock.settleOutOrder(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ code: 1, message: error.message });
  }
});

// 撤销已结算的执药单
app.post("/api/stock/out/orders/:id/revoke", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const result = await stock.revokeSettledOrder(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ code: 1, message: error.message });
  }
});

// 库存统计
app.get("/api/stock/inventory", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const result = await stock.getInventory(req.query);
    res.json(result);
  } catch (error) {
    res.status(400).json({ code: 1, message: error.message });
  }
});

app.get("/api/stock/inventory/alert", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const result = await stock.getInventoryAlert();
    res.json(result);
  } catch (error) {
    res.status(400).json({ code: 1, message: error.message });
  }
});

app.put("/api/stock/inventory/:herbName/min-value", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const herbName = decodeURIComponent(req.params.herbName);
    const result = await stock.setHerbMinValue(herbName, req.body.minValue);
    res.json(result);
  } catch (error) {
    res.status(400).json({ code: 1, message: error.message });
  }
});

app.get("/api/stock/inventory/:herbName/history", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const herbName = decodeURIComponent(req.params.herbName);
    const result = await stock.getHerbHistory(herbName, req.query);
    res.json(result);
  } catch (error) {
    res.status(400).json({ code: 1, message: error.message });
  }
});

// ==================== 场次配置管理接口 ====================

// 获取场次配置
app.get("/api/schedule/config", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const defaults = await schedule.getDefaultConfig();
    const overrides = await schedule.getOverrides();
    
    res.json({
      code: 0,
      data: {
        defaults,
        overrides
      }
    });
  } catch (error) {
    console.error("获取场次配置失败:", error);
    return res.status(500).json({ code: 1, message: error.message || "获取场次配置失败" });
  }
});

// 设置默认场次配置
app.post("/api/schedule/config/default", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { dayOfWeek, session, isOpen, maxBookings } = req.body;
    const result = await schedule.setDefaultConfig(dayOfWeek, session, isOpen, maxBookings);
    res.json(result);
  } catch (error) {
    console.error("设置默认配置失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "设置默认配置失败" });
  }
});

// 设置临时调整
app.post("/api/schedule/config/override", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { date, session, isOpen, reason } = req.body;
    const result = await schedule.setOverride(date, session, isOpen, reason);
    res.json(result);
  } catch (error) {
    console.error("设置临时调整失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "设置临时调整失败" });
  }
});

// 删除临时调整
app.delete("/api/schedule/config/override/:id", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await schedule.deleteOverride(id);
    res.json(result);
  } catch (error) {
    console.error("删除临时调整失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "删除临时调整失败" });
  }
});

// ==================== 健康检查和日志接口 ====================

// 健康检查
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "服务器运行正常" });
});

// 接收日志（写入文件）
app.post("/api/log", (req, res) => {
  const { timestamp, level, tag, message, data } = req.body;

  const logLine = `[${timestamp}] [${level}] [${tag}] ${message}`;
  const dataLine = data ? `\n  Data: ${JSON.stringify(data)}` : "";
  const fullLog = logLine + dataLine + "\n";

  // 追加写入文件
  const logPath = path.join(__dirname, "..", "debug.log");

  fs.appendFile(logPath, fullLog, (err) => {
    if (err) {
      console.error("写入日志文件失败:", err);
    }
  });

  res.json({ code: 0 });
});

const port = process.env.PORT || 80;

async function bootstrap() {
  await initDB();

  app.listen(port, () => {
    console.log("=================================");
    console.log("易方顺诊所助手服务器已启动");
    console.log(`服务地址: http://localhost:${port}`);
    console.log(`健康检查: http://localhost:${port}/health`);
    console.log("=================================");
  });
}

bootstrap();