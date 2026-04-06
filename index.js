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
const scheduleConfigLoader = require("./config/schedule_config_loader");

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

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

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
        rows: users.map(user => ({
          id: user.id,
          openid: user.openid,
          name: user.name,
          phone: user.phone,
          role: user.role,
          createdAt: user.createdAt || user.createTime
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

// 删除用户 - admin 和 super_admin 都可以
app.delete("/api/user/:id", requireRole(['admin', 'super_admin'], true), async (req, res) => {
  try {
    const { id } = req.params;

    // 检查用户是否存在
    const user = await User.findOne({ where: { id } });
    if (!user) {
      return res.status(404).json({ code: 1, message: "用户不存在" });
    }

    // 不能删除自己
    const currentUserPhone = req.headers['x-phone'];
    if (user.phone === currentUserPhone) {
      return res.status(400).json({ code: 1, message: "不能删除自己的账号" });
    }

    // 执行删除
    const deletedCount = await User.destroy({ where: { id } });

    res.json({ code: 0, message: "删除成功", data: { deletedCount } });
  } catch (error) {
    console.error("删除用户失败:", error);
    res.status(500).json({ code: 1, message: error.message || "删除用户失败" });
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
    let { date, session, personCount, phone } = req.body;

    // 设置默认值
    session = session || 'afternoon';
    personCount = personCount || 1;

    // 管理员可以指定 phone，普通用户使用自己的手机号
    let userInfo = { ...req.user };
    if (phone && (req.user.role === 'admin' || req.user.role === 'super_admin')) {
      // 管理员指定了手机号，使用指定的手机号
      userInfo.phone = phone;
    }

    // 【手机号改造】使用 req.user.phone 而非 openid
    const result = await booking.createBooking(date, session, personCount, userInfo);
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

// 获取所有预约列表（管理员）
app.get("/api/bookings", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const keyword = req.query.keyword || '';
    const status = req.query.status || 'all';

    const result = await booking.getBookingsList({ page, pageSize, keyword, status });
    res.json(result);
  } catch (error) {
    console.error("获取预约列表失败:", error);
    res.status(500).json({ code: 1, message: error.message || "获取预约列表失败" });
  }
});

// 更新预约信息（管理员）
app.put("/api/bookings/:id", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { phone, openid, date, session, personCount, time, status } = req.body;

    const booking = await Booking.findOne({ where: { id } });
    if (!booking) {
      return res.status(404).json({ code: 1, message: "预约不存在" });
    }

    // 构建更新数据
    const updateData = {};
    if (phone) updateData.phone = phone;
    if (openid !== undefined) updateData.openid = openid;
    if (date) updateData.date = date;
    if (session) updateData.session = session;
    if (personCount) updateData.personCount = personCount;
    if (time) updateData.time = time;
    if (status) updateData.status = status;

    await booking.update(updateData);

    // 重新获取更新后的数据
    const updatedBooking = await Booking.findOne({ where: { id } });
    res.json({ code: 0, message: "更新成功", data: updatedBooking });
  } catch (error) {
    console.error("更新预约失败:", error);
    res.status(400).json({ code: 1, message: error.message || "更新预约失败" });
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
    let totalPrice = 0;
    items.forEach(item => {
      totalPrice += parseFloat(item.totalPrice) || 0;
    });
    
    // 执药单用的是 totalPrice，其他表用 totalPrice
    const fieldName = orderTable === 'stock_out_orders' ? 'totalPrice' : 'totalPrice';
    await OrderModel.update({ [fieldName]: totalPrice }, { where: { id: orderId } });
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

// 获取系统统计（替代原 /api/admin/tables）
app.get("/api/system/stats", requireRole(['admin', 'super_admin']), async (req, res) => {
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
        tables.push({
          name,
          displayName: TABLE_NAMES[name] || name,
          exists: false,
          count: 0,
          error: error.message
        });
      }
    }

    res.json({ code: 0, data: { tables } });
  } catch (error) {
    console.error("获取系统统计失败:", error);
    res.status(500).json({ code: 1, message: error.message || "获取系统统计失败" });
  }
});

// ==================== 通用只读查询API ====================

// 允许只读查询的表白名单
const READONLY_TABLES = ['stock_in_items', 'stock_out_items', 'stock_logs'];

// 通用只读查询API（替代 admin/table 对只读表的查询）
app.get("/api/readonly/:table", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { table } = req.params;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const keyword = (req.query.keyword || '').trim();
    const searchFields = req.query.searchFields || '';

    // 检查表是否在白名单中
    if (!READONLY_TABLES.includes(table)) {
      return res.status(404).json({ code: 1, message: "表不存在或不可访问" });
    }

    const model = TABLE_MODELS[table];
    if (!model) {
      return res.status(404).json({ code: 1, message: "表不存在" });
    }

    // 获取所有数据（按createdAt降序）
    let allData = await model.findAll({
      order: [['createdAt', 'DESC']],
      raw: true
    });

    // 关键词搜索
    if (keyword) {
      const keywordLower = keyword.toLowerCase();
      // 如果指定了搜索字段，只在这些字段中搜索
      const fieldsToSearch = searchFields ? searchFields.split(',').map(f => f.trim()) : null;

      allData = allData.filter(row => {
        if (fieldsToSearch) {
          // 只在指定字段中搜索
          for (const key of fieldsToSearch) {
            const value = row[key];
            if (value !== null && value !== undefined) {
              const strValue = String(value).toLowerCase();
              if (strValue.includes(keywordLower)) {
                return true;
              }
            }
          }
        } else {
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
        }
        return false;
      });
    }

    // 执药明细特殊处理：关联药材表获取柜号
    if (table === 'stock_out_items') {
      const { Herb } = require('./wrappers/db-wrapper');
      allData = await Promise.all(allData.map(async (row) => {
        const herb = await Herb.findOne({ where: { name: row.herbName } });
        return {
          ...row,
          cabinetNo: herb ? herb.cabinetNo || '' : ''
        };
      }));
    }

    // 分页
    const totalCount = allData.length;
    const totalPages = Math.ceil(totalCount / pageSize);
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
    console.error("只读查询失败:", error);
    res.status(500).json({ code: 1, message: error.message || "查询失败" });
  }
});

// ==================== 数据导入导出API（仅超管）====================

// 导出表数据（支持主从表）
app.get("/api/admin/export/:name", requireRole(['super_admin']), async (req, res) => {
  try {
    const { name } = req.params;
    
    const model = TABLE_MODELS[name];
    if (!model) {
      return res.status(404).json({ code: 1, message: "表不存在" });
    }
    
    // 获取主表全量数据
    const mainData = await model.findAll({ raw: true });
    
    // 判断是否有详情表
    const detailTableMap = {
      'stock_in_orders': 'stock_in_items',
      'stock_out_orders': 'stock_out_items'
    };
    
    const detailTable = detailTableMap[name];
    if (detailTable) {
      const detailModel = TABLE_MODELS[detailTable];
      if (detailModel) {
        const detailData = await detailModel.findAll({ raw: true });
        return res.json({
          code: 0,
          data: {
            main: mainData,
            detail: detailData,
            mainTable: name,
            detailTable: detailTable
          }
        });
      }
    }
    
    // 单表导出
    res.json({ code: 0, data: mainData });
  } catch (error) {
    console.error("导出表失败:", error);
    res.status(500).json({ code: 1, message: error.message || "导出表失败" });
  }
});

// 导入数据（批量，支持更新或新增）
app.post("/api/admin/import/:name", requireRole(['super_admin']), async (req, res) => {
  try {
    const { name } = req.params;
    const { records } = req.body;
    
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ code: 1, message: "无有效数据" });
    }
    
    const model = TABLE_MODELS[name];
    if (!model) {
      return res.status(404).json({ code: 1, message: "表不存在" });
    }
    
    const results = { success: 0, failed: 0, errors: [] };
    
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      try {
        // 移除保护字段
        delete record.createdAt;
        delete record.updatedAt;
        
        if (record.id) {
          // 有ID：尝试更新，不存在则新增
          const existing = await model.findOne({ where: { id: record.id } });
          if (existing) {
            await model.update(record, { where: { id: record.id } });
          } else {
            await model.create(record);
          }
        } else {
          // 无ID：新增
          await model.create(record);
        }
        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push({ row: i + 1, error: err.message });
      }
    }
    
    res.json({ code: 0, data: results });
  } catch (error) {
    console.error("导入数据失败:", error);
    res.status(500).json({ code: 1, message: error.message || "导入数据失败" });
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
  console.log('========================================');
  console.log('DELETE /api/stock/out/orders/:id 被调用');
  console.log('  ID:', req.params.id);
  console.log('  用户:', req.user);
  console.log('========================================');
  try {
    const result = await stock.deleteOutOrder(req.params.id);
    res.json(result);
  } catch (error) {
    console.error('删除执药单失败:', error);
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

app.put("/api/stock/out/orders/:id", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const result = await stock.updateOutOrder(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ code: 1, message: error.message });
  }
});

// 结算执药单
app.post("/api/stock/out/orders/:id/settle", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const operator = req.user?.phone || req.user?.openid || 'admin';
    const result = await stock.settleOutOrder(req.params.id, operator);
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

// ==================== 场次配置管理接口 ====================

// 获取场次配置
app.get("/api/schedule/config", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const defaults = await schedule.getDefaultConfig();
    const overrides = await schedule.getOverrides();
    const config = scheduleConfigLoader.getConfig();

    res.json({
      code: 0,
      data: {
        defaults,
        overrides,
        maxBookings: config.max_bookings
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

// 设置场次最大预约人数
app.post("/api/schedule/config/max-bookings", requireRole(['admin', 'super_admin']), (req, res) => {
  try {
    const { morning, afternoon, evening } = req.body;

    if (morning < 1 || afternoon < 1 || evening < 1) {
      return res.status(400).json({ code: 1, message: '预约人数必须大于0' });
    }

    const config = scheduleConfigLoader.getConfig();
    config.max_bookings = { morning, afternoon, evening };

    const result = scheduleConfigLoader.saveConfig(config);
    if (!result.success) {
      return res.status(500).json({ code: 1, message: result.error || '保存失败' });
    }

    res.json({ code: 0, message: '场次配置已保存' });
  } catch (error) {
    console.error("设置场次配置失败:", error);
    return res.status(500).json({ code: 1, message: error.message || "设置场次配置失败" });
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

// ==================== LLM 配置管理 ====================

const LLM_CONFIG_PATH = path.join(__dirname, 'config/llm_api_config.json');

// 获取 LLM 配置
app.get("/api/llm-config", requireRole(['admin', 'super_admin']), (req, res) => {
  try {
    const configContent = fs.readFileSync(LLM_CONFIG_PATH, 'utf-8');
    const config = JSON.parse(configContent);
    res.json({ code: 0,  config });
  } catch (error) {
    console.error('读取LLM配置失败:', error);
    res.status(500).json({ code: 1, message: '读取配置失败: ' + error.message });
  }
});

// 保存 LLM 配置
app.post("/api/llm-config", requireRole(['admin', 'super_admin']), (req, res) => {
  try {
    const { prescription_ocr_llm_config, chat_llm_config } = req.body;

    // 验证必填字段
    if (!prescription_ocr_llm_config || !chat_llm_config) {
      return res.status(400).json({ code: 1, message: '缺少配置数据' });
    }

    // 构建新配置
    const newConfig = {
      prescription_ocr_llm_config: {
        api_key: prescription_ocr_llm_config.api_key || '',
        model: prescription_ocr_llm_config.model || '',
        prompt: prescription_ocr_llm_config.prompt || '',
        request: {
          hostname: prescription_ocr_llm_config.request?.hostname || '',
          port: prescription_ocr_llm_config.request?.port || 443,
          path: prescription_ocr_llm_config.request?.path || '',
          method: prescription_ocr_llm_config.request?.method || 'POST',
          headers: prescription_ocr_llm_config.request?.headers || { 'Content-Type': 'application/json' }
        }
      },
      chat_llm_config: {
        api_key: chat_llm_config.api_key || '',
        model: chat_llm_config.model || '',
        prompt: chat_llm_config.prompt || '',
        request: {
          hostname: chat_llm_config.request?.hostname || '',
          port: chat_llm_config.request?.port || 443,
          path: chat_llm_config.request?.path || '',
          method: chat_llm_config.request?.method || 'POST',
          headers: chat_llm_config.request?.headers || { 'Content-Type': 'application/json' }
        }
      }
    };

    // 写入文件
    fs.writeFileSync(LLM_CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf-8');
    console.log('[LLM Config] 配置已保存');

    res.json({ code: 0, message: '配置保存成功' });
  } catch (error) {
    console.error('保存LLM配置失败:', error);
    res.status(500).json({ code: 1, message: '保存配置失败: ' + error.message });
  }
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
  try {
    await initDB();

    app.listen(port, () => {
      console.log("=================================");
      console.log("易方顺诊所助手服务器已启动");
      console.log(`服务地址: http://localhost:${port}`);
      console.log(`健康检查: http://localhost:${port}/health`);
      console.log("=================================");
    });
  } catch (err) {
    console.error("=================================");
    console.error("服务器启动失败！");
    console.error("错误详情:", err.message);
    console.error("错误堆栈:", err.stack);
    console.error("=================================");
    process.exit(1);
  }
}

bootstrap();