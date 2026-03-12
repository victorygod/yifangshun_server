const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const morgan = require("morgan");
const { init: initDB, Counter, User, Booking, ChatMessage, Prescription } = require("./db");

const logger = morgan("tiny");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors());
app.use(logger);

// 首页
app.get("/", async (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ==================== 旧接口（保留兼容） ====================

// 更新计数
app.post("/api/count", async (req, res) => {
  const { action } = req.body;
  if (action === "inc") {
    await Counter.create();
  } else if (action === "clear") {
    await Counter.destroy({
      truncate: true,
    });
  }
  res.send({
    code: 0,
    data: await Counter.count(),
  });
});

// 获取计数
app.get("/api/count", async (req, res) => {
  const result = await Counter.count();
  res.send({
    code: 0,
    data: result,
  });
});

// 小程序调用，获取微信 Open ID
app.get("/api/wx_openid", async (req, res) => {
  if (req.headers["x-wx-source"]) {
    res.send(req.headers["x-wx-openid"]);
  }
});

// ==================== 工具函数 ====================

// 生成ID
const generateId = () => Math.random().toString(36).substr(2, 9);

// ==================== 登录相关接口 ====================

// 微信授权登录
app.post("/api/login", async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ code: 1, message: "缺少登录code" });
  }

  try {
    // 查找该code对应的用户
    let user = await User.findOne({ where: { code } });

    const isNewUser = !user;

    if (isNewUser) {
      // 新用户，创建用户
      const openid = `user_${generateId()}`;
      const sessionKey = `session_${generateId()}`;
      user = await User.create({
        openid,
        code,
        sessionKey,
        isNewUser: true,
      });

      return res.json({
        code: 0,
        data: {
          openid,
          sessionKey,
          isNewUser: true,
        },
      });
    } else {
      // 老用户，更新sessionKey
      const sessionKey = `session_${generateId()}`;
      user.sessionKey = sessionKey;
      await user.save();

      return res.json({
        code: 0,
        data: {
          openid: user.openid,
          sessionKey: user.sessionKey,
          phone: user.phone,
          name: user.name,
          isNewUser: false,
        },
      });
    }
  } catch (error) {
    console.error("登录失败:", error);
    return res.status(500).json({ code: 1, message: "登录失败" });
  }
});

// 绑定手机号和姓名（首次登录）
app.post("/api/bind-user-info", async (req, res) => {
  const { openid, name, phone } = req.body;

  if (!openid || !name || !phone) {
    return res.status(400).json({ code: 1, message: "缺少必要参数" });
  }

  if (phone.length !== 11) {
    return res.status(400).json({ code: 1, message: "手机号格式不正确" });
  }

  try {
    const user = await User.findByPk(openid);

    if (!user) {
      return res.status(404).json({ code: 1, message: "用户不存在" });
    }

    user.phone = phone;
    user.name = name;
    user.isNewUser = false;
    await user.save();

    return res.json({ code: 0, message: "绑定成功" });
  } catch (error) {
    console.error("绑定用户信息失败:", error);
    return res.status(500).json({ code: 1, message: "绑定失败" });
  }
});

// 绑定手机号（首次登录）- 兼容旧接口
app.post("/api/bind-phone", async (req, res) => {
  const { openid, phone } = req.body;

  if (!openid || !phone) {
    return res.status(400).json({ code: 1, message: "缺少必要参数" });
  }

  if (phone.length !== 11) {
    return res.status(400).json({ code: 1, message: "手机号格式不正确" });
  }

  try {
    const user = await User.findByPk(openid);

    if (!user) {
      return res.status(404).json({ code: 1, message: "用户不存在" });
    }

    user.phone = phone;
    user.isNewUser = false;
    await user.save();

    return res.json({ code: 0, message: "绑定成功" });
  } catch (error) {
    console.error("绑定手机号失败:", error);
    return res.status(500).json({ code: 1, message: "绑定失败" });
  }
});

// ==================== 预约相关接口 ====================

// 模拟可预约日期（生成30天的数据）
const generateAvailableSlots = async (startDate) => {
  const slots = [];
  const start = new Date(startDate);
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // 获取所有已预约的日期
  const allBookings = await Booking.findAll({
    where: { status: "confirmed" },
  });
  const bookedDates = new Set(allBookings.map((b) => b.date));

  for (let i = 0; i < 30; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split("T")[0];
    const dayOfWeek = date.getDay(); // 0是周日，1是周一，...，6是周六

    let status;
    if (bookedDates.has(dateStr)) {
      status = "booked";
    } else {
      // 预约规则检查
      // 规则1: 不支持当日预约（今天不能预约今天）
      if (dateStr === todayStr) {
        status = "full";
      }
      // 规则2: 每周二都不可预约（dayOfWeek === 2）
      else if (dayOfWeek === 2) {
        status = "full";
      }
      // 规则3: 其他情况随机生成状态
      else {
        const rand = Math.random();
        if (rand < 0.5) {
          status = "available";
        } else {
          status = "full";
        }
      }
    }

    slots.push({ date: dateStr, status });
  }
  return slots;
};

// 获取可预约日期
app.get("/api/available-slots", async (req, res) => {
  const { startDate, endDate } = req.query;

  try {
    const slots = await generateAvailableSlots(
      startDate || new Date().toISOString().split("T")[0]
    );

    res.json({ code: 0, data: slots });
  } catch (error) {
    console.error("获取可预约日期失败:", error);
    return res.status(500).json({ code: 1, message: "获取可预约日期失败" });
  }
});

// 创建预约
app.post("/api/booking", async (req, res) => {
  const { date, openid } = req.body;

  if (!date || !openid) {
    return res.status(400).json({ code: 1, message: "缺少必要参数" });
  }

  try {
    // 检查用户是否已有预约（一个用户最多同时预约一天）
    const existingBooking = await Booking.findOne({
      where: { openid, status: "confirmed" },
    });

    if (existingBooking) {
      // 格式化日期为月日格式
      const dateObj = new Date(existingBooking.date);
      const month = dateObj.getMonth() + 1;
      const day = dateObj.getDate();
      const formattedDate = `${month}月${day}日`;

      return res.status(400).json({
        code: 1,
        message: `您已预约${formattedDate}，最多同时预约一天`,
      });
    }

    // 检查该日期是否已有预约
    const dateBooking = await Booking.findOne({
      where: { date, status: "confirmed" },
    });

    if (dateBooking) {
      return res.status(400).json({ code: 1, message: "该日期已有预约" });
    }

    // 检查预约规则
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const bookingDate = new Date(date);
    const dayOfWeek = bookingDate.getDay();

    // 不支持当日预约
    if (date === todayStr) {
      return res.status(400).json({ code: 1, message: "不支持当日预约" });
    }

    // 周二不可预约
    if (dayOfWeek === 2) {
      return res.status(400).json({ code: 1, message: "周二不可预约" });
    }

    const bookingId = generateId();
    const booking = await Booking.create({
      bookingId,
      openid,
      date,
      status: "confirmed",
      time: "09:30",
    });

    res.json({
      code: 0,
      data: {
        bookingId: booking.bookingId,
        date: booking.date,
        status: booking.status,
      },
    });
  } catch (error) {
    console.error("创建预约失败:", error);
    return res.status(500).json({ code: 1, message: "创建预约失败" });
  }
});

// 取消预约
app.delete("/api/booking/:bookingId", async (req, res) => {
  const { bookingId } = req.params;
  const { openid } = req.query;

  if (!openid) {
    return res.status(400).json({ code: 1, message: "缺少用户标识" });
  }

  try {
    const booking = await Booking.findByPk(bookingId);

    if (!booking) {
      return res.status(404).json({ code: 1, message: "预约不存在" });
    }

    // 检查是否是当前用户的预约
    if (booking.openid !== openid) {
      return res.status(403).json({ code: 1, message: "无权取消该预约" });
    }

    // 检查是否可以取消（最晚提前一天）
    const bookingDate = new Date(booking.date);
    const today = new Date();
    const diffTime = bookingDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 1) {
      return res
        .status(400)
        .json({ code: 1, message: "预约当天不能取消，请提前一天取消" });
    }

    booking.status = "cancelled";
    await booking.save();

    return res.json({ code: 0, message: "预约已取消" });
  } catch (error) {
    console.error("取消预约失败:", error);
    return res.status(500).json({ code: 1, message: "取消预约失败" });
  }
});

// 获取我的预约
app.get("/api/my-bookings", async (req, res) => {
  const { openid } = req.query;

  if (!openid) {
    return res.status(400).json({ code: 1, message: "缺少用户标识" });
  }

  try {
    const bookings = await Booking.findAll({
      where: { openid, status: "confirmed" },
      order: [["date", "ASC"]],
    });

    const bookingList = bookings.map((booking) => ({
      bookingId: booking.bookingId,
      date: booking.date,
      time: booking.time,
      status: booking.status,
      createTime: booking.createTime,
    }));

    res.json({ code: 0, data: bookingList });
  } catch (error) {
    console.error("获取我的预约失败:", error);
    return res.status(500).json({ code: 1, message: "获取我的预约失败" });
  }
});

// ==================== 处方识别接口 ====================

// 处方OCR识别
app.post("/api/prescription/ocr", async (req, res) => {
  const { image, openid } = req.body;

  if (!image) {
    return res.status(400).json({ code: 1, message: "缺少图片数据" });
  }

  try {
    const mockResult = `处方单\n\n姓名：张三\n性别：男\n年龄：35岁\n\n【诊断】\n脾胃虚弱\n\n【处方】\n1. 白术 15g\n2. 茯苓 15g\n3. 陈皮 10g\n4. 半夏 10g\n5. 甘草 6g\n\n【用法】\n水煎服，每日一剂，分早晚两次服用。\n\n【注意事项】\n忌食生冷辛辣食物，注意保暖。`;

    const prescriptionId = generateId();
    await Prescription.create({
      prescriptionId,
      openid: openid || "anonymous",
      image,
      text: mockResult,
    });

    res.json({
      code: 0,
      data: {
        prescriptionId,
        text: mockResult,
      },
    });
  } catch (error) {
    console.error("处方识别失败:", error);
    return res.status(500).json({ code: 1, message: "处方识别失败" });
  }
});

// 获取处方历史
app.get("/api/prescription/history", async (req, res) => {
  const { openid } = req.query;

  if (!openid) {
    return res.status(400).json({ code: 1, message: "缺少用户标识" });
  }

  try {
    const prescriptions = await Prescription.findAll({
      where: { openid },
      order: [["createTime", "DESC"]],
    });

    const prescriptionList = prescriptions.map((p) => ({
      prescriptionId: p.prescriptionId,
      image: p.image,
      text: p.text,
      createTime: p.createTime,
    }));

    res.json({ code: 0, data: prescriptionList });
  } catch (error) {
    console.error("获取处方历史失败:", error);
    return res.status(500).json({ code: 1, message: "获取处方历史失败" });
  }
});

// ==================== AI咨询接口 ====================

// AI聊天
app.post("/api/chat", async (req, res) => {
  const { message, openid } = req.body;

  if (!message) {
    return res.status(400).json({ code: 1, message: "消息内容不能为空" });
  }

  try {
    // 保存用户消息
    const userMessageId = generateId();
    await ChatMessage.create({
      messageId: userMessageId,
      openid: openid || "anonymous",
      content: message,
      type: "user",
    });

    // 模拟延迟1-2秒
    setTimeout(async () => {
      const reply = "感谢您的咨询，我们会尽快回复您。";

      // 保存机器人回复
      const botMessageId = generateId();
      await ChatMessage.create({
        messageId: botMessageId,
        openid: openid || "anonymous",
        content: reply,
        type: "bot",
      });

      res.json({
        code: 0,
        data: {
          reply,
        },
      });
    }, 1000 + Math.random() * 1000);
  } catch (error) {
    console.error("AI聊天失败:", error);
    return res.status(500).json({ code: 1, message: "AI聊天失败" });
  }
});

// 获取聊天历史
app.get("/api/chat/history", async (req, res) => {
  const { openid } = req.query;

  if (!openid) {
    return res.status(400).json({ code: 1, message: "缺少用户标识" });
  }

  try {
    const messages = await ChatMessage.findAll({
      where: { openid },
      order: [["createTime", "ASC"]],
    });

    const messageList = messages.map((msg) => ({
      messageId: msg.messageId,
      content: msg.content,
      type: msg.type,
      createTime: msg.createTime,
    }));

    res.json({ code: 0, data: messageList });
  } catch (error) {
    console.error("获取聊天历史失败:", error);
    return res.status(500).json({ code: 1, message: "获取聊天历史失败" });
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
    console.log("GET    /api/available-slots");
    console.log("POST   /api/booking");
    console.log("DELETE /api/booking/:bookingId");
    console.log("GET    /api/my-bookings");
    console.log("POST   /api/prescription/ocr");
    console.log("GET    /api/prescription/history");
    console.log("POST   /api/chat");
    console.log("GET    /api/chat/history");
    console.log("GET    /health");
    console.log("POST   /api/log");
    console.log("=================================\n");
  });
}

bootstrap();