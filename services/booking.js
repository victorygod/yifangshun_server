const { Booking, Op } = require('../db');

// 生成随机 ID
const generateId = () => Math.random().toString(36).substr(2, 9);

// 生成可预约日期（内部函数）
async function generateAvailableSlots(startDate, openid) {
  const start = new Date(startDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 14); // 返回未来14天

  const slots = [];

  // 获取所有已预约的日期，并统计每个日期的预约数量
  const bookings = await Booking.findAll({
    where: { status: "confirmed" },
    attributes: ["date", "openid"],
  });

  // 统计每个日期的预约数量
  const bookingCountMap = {};
  bookings.forEach((booking) => {
    const date = booking.date;
    if (!bookingCountMap[date]) {
      bookingCountMap[date] = { count: 0, users: new Set() };
    }
    bookingCountMap[date].count++;
    bookingCountMap[date].users.add(booking.openid);
  });

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const maxBookingsPerDay = 10; // 每日最多10个预约

  for (let i = 0; i < 14; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i);

    const dateStr = date.toISOString().split("T")[0];
    const dayOfWeek = date.getDay(); // 0是周日，1是周一，...，6是周六

    const bookingInfo = bookingCountMap[dateStr] || { count: 0, users: new Set() };
    const bookingCount = bookingInfo.count;

    let status;
    // 预约规则检查
    // 规则1: 不支持当日预约（今天不能预约今天）
    if (dateStr === todayStr) {
      status = "full";
    }
    // 规则2: 每周二都不可预约（dayOfWeek === 2）
    else if (dayOfWeek === 2) {
      status = "full";
    }
    // 规则3: 检查当前用户是否已经预约了这天
    else if (openid && bookingInfo.users.has(openid)) {
      status = "booked";
    }
    // 规则4: 根据当日余号判断
    else if (bookingCount >= maxBookingsPerDay) {
      status = "full";
    }
    else {
      status = "available";
    }

    slots.push({ date: dateStr, status });
  }
  return slots;
}

// 获取可预约日期
async function getAvailableSlots(startDate, openid) {
  const slots = await generateAvailableSlots(
    startDate || new Date().toISOString().split("T")[0],
    openid
  );
  return { code: 0, data: slots };
}

// 创建预约
async function createBooking(date, openid) {
  if (!date || !openid) {
    throw new Error("缺少必要参数");
  }

  // 计算今天的日期
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  
  // 计算明天的日期
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  // 检查用户是否已有预约（一个用户最多同时预约一天，从明天开始检查）
  const existingBooking = await Booking.findOne({
    where: { 
      openid, 
      status: "confirmed",
      date: {
        [Op.gte]: tomorrowStr  // 大于等于明天
      }
    },
  });

  if (existingBooking) {
    // 格式化日期为月日格式
    const dateObj = new Date(existingBooking.date);
    const month = dateObj.getMonth() + 1;
    const day = dateObj.getDate();
    const formattedDate = `${month}月${day}日`;

    throw new Error(`您已预约${formattedDate}，最多同时预约一天`);
  }

  // 检查该日期的预约数量是否已达上限
  const dateBookingsCount = await Booking.count({
    where: { 
      date, 
      status: "confirmed"
    },
  });

  const maxBookingsPerDay = 10; // 每日最多10个预约
  if (dateBookingsCount >= maxBookingsPerDay) {
    throw new Error("该日期预约已满");
  }

  // 检查预约规则
  const bookingDate = new Date(date);

  // 不支持当日预约
  if (date === todayStr) {
    throw new Error("不支持当日预约");
  }

  const bookingId = generateId();
  const booking = await Booking.create({
    bookingId,
    openid,
    date,
    status: "confirmed",
    time: "14:00",
  });

  return {
    code: 0,
    data: {
      bookingId: booking.bookingId,
      date: booking.date,
      status: booking.status,
    },
  };
}

// 取消预约
async function cancelBooking(bookingId, openid) {
  if (!openid) {
    throw new Error("缺少用户标识");
  }

  const booking = await Booking.findByPk(bookingId);

  if (!booking) {
    throw new Error("预约不存在");
  }

  // 检查是否是当前用户的预约
  if (booking.openid !== openid) {
    throw new Error("无权取消该预约");
  }

  // 检查是否可以取消（最晚提前一天）
  const bookingDate = new Date(booking.date);
  const today = new Date();
  const diffTime = bookingDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 1) {
    throw new Error("预约当天不能取消，请提前一天取消");
  }

  booking.status = "cancelled";
  await booking.save();

  return { code: 0, message: "预约已取消" };
}

// 获取我的预约
async function getMyBookings(openid) {
  if (!openid) {
    throw new Error("缺少用户标识");
  }

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

  return { code: 0, data: bookingList };
}

module.exports = {
  getAvailableSlots,
  createBooking,
  cancelBooking,
  getMyBookings,
};