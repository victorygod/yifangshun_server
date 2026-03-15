// 加载环境变量
require('dotenv').config();

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const morgan = require("morgan");
const fs = require("fs");
const path = require("path");
const { init: initDB, Counter, User, Booking, ChatMessage, Prescription, sequelize, Op } = require("./wrappers/db-wrapper");

// 导入 service 模块
const auth = require("./services/auth");
const booking = require("./services/booking");
const prescription = require("./services/prescription");
const chat = require("./services/chat");

// 导入权限中间件
const { requireRole } = require("./middlewares/auth");

const logger = morgan("tiny");

const app = express();
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(cors());
app.use(logger);

// 首页 - 返回用户列表数据（前端通过AJAX获取）
app.get("/api/home/users", async (req, res) => {
  try {
    const users = await User.findAll({
      where: {
        phone: {
          [Op.ne]: null
        }
      },
      order: [['createdAt', 'DESC']]
    });

    res.json({
      code: 0,
      data: users.map(user => ({
        openid: user.openid,
        name: user.name,
        phone: user.phone,
        role: user.role,
        createdAt: user.createdAt
      }))
    });
  } catch (error) {
    console.error("获取用户列表失败:", error);
    res.status(500).json({ code: 1, message: error.message || "获取用户列表失败" });
  }
});

// 首页 - 返回HTML页面
app.get("/", (req, res) => {
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

// ==================== 角色管理接口 ====================

// 获取用户列表（带角色信息）
app.get("/api/users", async (req, res) => {
  try {
    const { role = 'all', page = 1, pageSize = 20 } = req.query;
    const where = {};
    
    if (role !== 'all') {
      where.role = role;
    }
    
    const users = await User.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });

    const startIndex = (parseInt(page) - 1) * parseInt(pageSize);
    const endIndex = startIndex + parseInt(pageSize);
    const paginatedUsers = users.slice(startIndex, endIndex);

    res.json({
      code: 0,
      data: paginatedUsers.map(user => ({
        openid: user.openid,
        name: user.name,
        phone: user.phone,
        role: user.role,
        createdAt: user.createdAt
      })),
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalCount: users.length,
        totalPages: Math.ceil(users.length / parseInt(pageSize))
      }
    });
  } catch (error) {
    console.error("获取用户列表失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "获取用户列表失败" });
  }
});

// 设置用户角色
app.post("/api/user/set-role", requireRole(['super_admin']), async (req, res) => {
  try {
    const { openid, role } = req.body;
    
    if (!openid || !role) {
      return res.status(400).json({ code: 1, message: "缺少必要参数" });
    }

    // 验证角色值
    if (!['user', 'admin', 'super_admin'].includes(role)) {
      return res.status(400).json({ code: 1, message: "无效的角色值" });
    }

    const user = await User.findByPk(openid);
    if (!user) {
      return res.status(404).json({ code: 1, message: "用户不存在" });
    }

    // 更新用户角色
    await User.update({ role }, { where: { openid } });

    res.json({ code: 0, message: "角色设置成功" });
  } catch (error) {
    console.error("设置用户角色失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "设置用户角色失败" });
  }
});

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

// 创建预约
app.post("/api/booking", async (req, res) => {
  try {
    const { date, openid } = req.body;
    const result = await booking.createBooking(date, openid);
    res.json(result);
  } catch (error) {
    console.error("创建预约失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "创建预约失败" });
  }
});

// 取消预约
app.delete("/api/booking/:bookingId", async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { openid } = req.query;
    const result = await booking.cancelBooking(bookingId, openid);
    res.json(result);
  } catch (error) {
    console.error("取消预约失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "取消预约失败" });
  }
});

// 获取我的预约
app.get("/api/my-bookings", async (req, res) => {
  try {
    const { openid } = req.query;
    const result = await booking.getMyBookings(openid);
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
app.get("/api/prescription/user-history", async (req, res) => {
  try {
    const { openid } = req.query;
    const result = await prescription.getPrescriptionHistory(openid);
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
app.post("/api/prescription/update", async (req, res) => {
  try {
    const { id, prescriptionId, thumbnail, ...prescriptionData } = req.body;
    // 优先使用 id（数据库主键），如果没有则使用 prescriptionId
    const targetId = id || prescriptionId;
    
    if (!targetId) {
      return res.status(400).json({ code: 1, message: "缺少处方ID" });
    }
    
    const result = await prescription.updatePrescription(targetId, prescriptionId, prescriptionData, thumbnail);
    res.json(result);
  } catch (error) {
    console.error("更新处方失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "更新处方失败，请稍后重试" });
  }
});

// 删除处方
app.delete("/api/prescription/:prescriptionId", async (req, res) => {
  try {
    const { prescriptionId } = req.params;
    const { openid } = req.query;
    
    if (!prescriptionId) {
      return res.status(400).json({ code: 1, message: "缺少处方ID" });
    }
    
    const result = await prescription.deletePrescription(prescriptionId, openid);
    res.json(result);
  } catch (error) {
    console.error("删除处方失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "删除处方失败，请稍后重试" });
  }
});

// 获取待审核处方列表
app.get("/api/prescription/pending", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    // 管理员查看待审核列表时自动清理过期处方
    const cleanResult = await prescription.cleanExpiredPrescriptions();
    
    const { page = 1, pageSize = 20 } = req.query;
    const result = await prescription.getPrescriptionsList({
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      status: '待审核'
    });
    
    // 将清理结果附加到响应中，前端可以根据清理的缩略图链接删除对应的云存储文件
    result.cleaned = cleanResult;
    
    res.json(result);
  } catch (error) {
    console.error("获取待审核处方列表失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "获取待审核处方列表失败" });
  }
});

// 审核处方
app.post("/api/prescription/review", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { id, action } = req.body;
    
    if (!id || !action) {
      return res.status(400).json({ code: 1, message: "缺少必要参数" });
    }

    const reviewerName = req.user.name || req.user.openid;
    const result = await prescription.reviewPrescription(id, action, req.user.openid, reviewerName);
    res.json(result);
  } catch (error) {
    console.error("审核处方失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "审核处方失败" });
  }
});

// 确认审核通过（覆盖旧记录）
app.post("/api/prescription/confirm-approve", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { id } = req.body;
    
    if (!id) {
      return res.status(400).json({ code: 1, message: "缺少必要参数" });
    }

    const reviewerName = req.user.name || req.user.openid;
    const result = await prescription.confirmPrescriptionApprove(id, req.user.openid, reviewerName);
    res.json(result);
  } catch (error) {
    console.error("确认审核失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "确认审核失败" });
  }
});

// 更新处方ID
app.post("/api/prescription/update-prescription-id", requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { oldPrescriptionId, newPrescriptionId } = req.body;
    
    if (!oldPrescriptionId || !newPrescriptionId) {
      return res.status(400).json({ code: 1, message: "缺少必要参数" });
    }

    const result = await prescription.updatePrescriptionIdByPrescriptionId(oldPrescriptionId, newPrescriptionId);
    res.json(result);
  } catch (error) {
    console.error("更新处方ID失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "更新处方ID失败" });
  }
});

// 获取所有处方列表（管理员）
app.get("/api/prescription/list", async (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword = '', status = 'all' } = req.query;
    const result = await prescription.getPrescriptionsList({ 
      page: parseInt(page), 
      pageSize: parseInt(pageSize),
      keyword,
      status
    });
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

// 获取聊天历史
app.get("/api/chat/history", async (req, res) => {
  try {
    const { openid } = req.query;
    const result = await chat.getChatHistory(openid);
    res.json(result);
  } catch (error) {
    console.error("获取聊天历史失败:", error);
    return res.status(400).json({ code: 1, message: error.message || "获取聊天历史失败" });
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
    console.log("\n可用接口:");
    console.log("POST   /api/login");
    console.log("POST   /api/bind-user-info");
    console.log("POST   /api/bind-phone");
    console.log("GET    /api/users");
    console.log("POST   /api/user/set-role");
    console.log("GET    /api/available-slots");
    console.log("POST   /api/booking");
    console.log("DELETE /api/booking/:bookingId");
    console.log("GET    /api/my-bookings");
    console.log("POST   /api/prescription/ocr");
    console.log("GET    /api/prescription/history");
    console.log("POST   /api/prescription/save");
    console.log("POST   /api/prescription/update");
    console.log("POST   /api/prescription/delete");
    console.log("GET    /api/prescription/pending");
    console.log("POST   /api/prescription/review");
    console.log("POST   /api/prescription/confirm-approve");
    console.log("POST   /api/prescription/update-prescription-id");
    console.log("GET    /api/prescription/list");
    console.log("POST   /api/chat");
    console.log("GET    /api/chat/history");
    console.log("GET    /health");
    console.log("POST   /api/log");
    console.log("=================================\n");
  });
}

bootstrap();