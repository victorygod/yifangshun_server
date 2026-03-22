const { Booking, ScheduleConfig, Op, User } = require('../wrappers/db-wrapper');

// 场次配置（名称和时段，不含容量——容量从 DB 读取）
const SESSION_CONFIG = {
  morning: { name: '上午', timeRange: '08:00-12:00', maxBookings: 2 },
  afternoon: { name: '下午', timeRange: '14:00-18:00', maxBookings: 4 },
  evening: { name: '晚上', timeRange: '19:00-21:00', maxBookings: 2 }
};

// 硬编码的默认停诊规则（仅在 DB 无配置时兜底）
const DEFAULT_CLOSED_SESSIONS = {
  0: { morning: true, afternoon: false, evening: false },  // 周日
  1: { morning: true, afternoon: false, evening: false },  // 周一
  2: { morning: true, afternoon: true, evening: true },    // 周二
  3: { morning: true, afternoon: false, evening: false },  // 周三
  4: { morning: false, afternoon: true, evening: false },  // 周四
  5: { morning: true, afternoon: false, evening: false },  // 周五
  6: { morning: true, afternoon: false, evening: false }   // 周六
};

// 生成随机 ID
const generateId = () => Math.random().toString(36).substr(2, 9);

/**
 * 从 ScheduleConfig 表查询某个日期+场次的实际配置。
 * 优先级：临时调整（date+session 或 date+all）> 默认规则（dayOfWeek+session）> 硬编码兜底
 * 返回 { isOpen, maxBookings }
 */
async function getSessionConfig(dateStr, session, dayOfWeek) {
  const defaultMax = SESSION_CONFIG[session].maxBookings;

  try {
    // 1. 临时调整：精确匹配日期+场次，或 全天(all)
    const override = await ScheduleConfig.findOne({
      where: {
        type: 'override',
        date: dateStr,
        session: { [Op.in]: [session, 'all'] }
      },
      order: [['session', 'DESC']] // 'morning'/'afternoon'/'evening' > 'all'，具体场次优先
    });

    if (override) {
      return {
        isOpen: override.isOpen,
        maxBookings: override.maxBookings != null ? override.maxBookings : defaultMax
      };
    }

    // 2. 默认规则（按星期）
    const defaultCfg = await ScheduleConfig.findOne({
      where: { type: 'default', dayOfWeek, session }
    });

    if (defaultCfg) {
      return {
        isOpen: defaultCfg.isOpen,
        maxBookings: defaultCfg.maxBookings != null ? defaultCfg.maxBookings : defaultMax
      };
    }
  } catch (e) {
    // ScheduleConfig 表不存在或查询失败时，静默降级到硬编码
  }

  // 3. 硬编码兜底
  return {
    isOpen: !DEFAULT_CLOSED_SESSIONS[dayOfWeek][session],
    maxBookings: defaultMax
  };
}

// 获取本地日期字符串（YYYY-MM-DD 格式，考虑东八区）
function getLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 生成可预约日期（内部函数）- 支持场次
async function generateAvailableSlots(startDate, openid) {
  const start = new Date(startDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 14); // 返回未来14天

  const slots = [];

  // 【手机号改造】根据 openid 获取用户的 phone，用于判断已预约状态
  let userPhone = null;
  if (openid) {
    const user = await User.findOne({ where: { openid } });
    userPhone = user ? user.phone : null;
  }

  // 获取所有有效预约（confirmed 和 checked_in）
  const bookings = await Booking.findAll({
    where: { 
      status: { [Op.in]: ["confirmed", "checked_in"] }
    }
  });

  // 按日期和场次统计预约数量
  const bookingCountMap = {};
  bookings.forEach((booking) => {
    const date = booking.date;
    const session = booking.session || 'afternoon'; // 兼容旧数据，默认下午
    const personCount = booking.personCount || 1;   // 兼容旧数据，默认1人
    
    const key = `${date}_${session}`;
    if (!bookingCountMap[key]) {
      bookingCountMap[key] = { count: 0, users: new Set() };
    }
    bookingCountMap[key].count += personCount;
    // 【手机号改造】使用 phone 而非 openid
    bookingCountMap[key].users.add(booking.phone);
  });

  const today = new Date();
  const todayStr = getLocalDateString(today);

  for (let i = 0; i < 14; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i);

    const dateStr = getLocalDateString(date);
    const dayOfWeek = date.getDay();

    // 构建该日期的场次信息
    const sessions = {};
    
    for (const sessionKey of ['morning', 'afternoon', 'evening']) {
      const key = `${dateStr}_${sessionKey}`;
      const bookingInfo = bookingCountMap[key] || { count: 0, users: new Set() };

      // 从 DB 读取实际配置（含临时调整和默认规则）
      const cfg = await getSessionConfig(dateStr, sessionKey, dayOfWeek);

      // 判断场次状态
      let status, statusText;

      if (!cfg.isOpen) {
        status = 'closed';
        statusText = '停诊';
      } else if (userPhone && bookingInfo.users.has(userPhone)) {
        status = 'booked';
        statusText = '已预约';
      } else if (bookingInfo.count >= cfg.maxBookings) {
        status = 'full';
        statusText = '已约满';
      } else {
        status = 'available';
        statusText = '可预约';
      }

      sessions[sessionKey] = {
        status,
        statusText,
        remaining: Math.max(0, cfg.maxBookings - bookingInfo.count),
        maxBookings: cfg.maxBookings
      };
    }

    slots.push({
      date: dateStr,
      dayOfWeek,
      sessions,
      // 兼容旧接口：顶级 status 反映该天的综合状态
      // 全天停诊(周二) → 'full'，用户已预约任意场次 → 'booked'，否则 'available'
      status: Object.values(sessions).every(s => s.status === 'closed' || s.status === 'full')
        ? 'full'
        : Object.values(sessions).some(s => s.status === 'booked')
          ? 'booked'
          : 'available'
    });
  }
  
  return slots;
}

// 获取可预约日期
async function getAvailableSlots(startDate, openid) {
  const start = startDate ? new Date(startDate) : new Date();
  const startStr = getLocalDateString(start);
  const slots = await generateAvailableSlots(startStr, openid);
  return { code: 0, data: slots };
}

// 创建预约 - 支持场次和人数
// 【手机号改造】userInfo 参数为 req.user 对象（包含 openid, phone, role）
async function createBooking(date, session, personCount, userInfo) {
  if (!date || !session || !personCount || !userInfo) {
    throw new Error("缺少必要参数");
  }

  // 【手机号改造】直接从 userInfo 获取 phone，无需查询数据库
  const openid = userInfo.openid;
  const phone = userInfo.phone;
  
  if (!phone) {
    throw new Error("用户未绑定手机号");
  }
  
  console.log('[createBooking] userInfo:', userInfo);
  console.log('[createBooking] openid:', openid);
  console.log('[createBooking] phone:', phone);

  // 验证场次
  if (!SESSION_CONFIG[session]) {
    throw new Error("无效的场次");
  }

  // 验证人数（1-3人）
  if (personCount < 1 || personCount > 3) {
    throw new Error("预约人数必须为1-3人");
  }

  const today = new Date();
  const todayStr = getLocalDateString(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = getLocalDateString(tomorrow);

  console.log(`预约检查 - 今天: ${todayStr}, 明天: ${tomorrowStr}, 预约日期: ${date}, 场次: ${session}, 人数: ${personCount}`);

  // 检查用户是否已有预约（一个用户最多同时预约一个场次）
  const existingBooking = await Booking.findOne({
    where: { 
      phone,
      status: { [Op.in]: ["confirmed", "checked_in"] },
      date: {
        [Op.gte]: tomorrowStr
      }
    },
  });

  if (existingBooking) {
    console.log(`找到已有预约: ${existingBooking.date} ${existingBooking.session || 'afternoon'}`);
    const dateObj = new Date(existingBooking.date);
    const month = dateObj.getMonth() + 1;
    const day = dateObj.getDate();
    const formattedDate = `${month}月${day}日`;
    const sessionName = SESSION_CONFIG[existingBooking.session || 'afternoon']?.name || '下午';
    
    throw new Error(`您已预约${formattedDate}${sessionName}场次，最多同时预约一个场次`);
  }

  // 检查该场次的预约人数是否已达上限
  const allBookings = await Booking.findAll({
    where: { 
      date, 
      session,
      status: { [Op.in]: ["confirmed", "checked_in"] }
    },
  });
  
  // 统计该场次已预约总人数
  const sessionBookingsCount = allBookings.reduce((total, booking) => {
    return total + (booking.personCount || 1);
  }, 0);

  // 检查预约规则
  const bookingDate = new Date(date);
  const dayOfWeek = bookingDate.getDay();

  // 不支持当日预约
  if (date === todayStr) {
    throw new Error("不支持当日预约");
  }

  // 从 DB 读取该场次实际配置（含临时调整，优先于硬编码）
  const sessionCfg = await getSessionConfig(date, session, dayOfWeek);

  if (!sessionCfg.isOpen) {
    throw new Error(`${SESSION_CONFIG[session].name}场次今日停诊`);
  }

  if (sessionBookingsCount + personCount > sessionCfg.maxBookings) {
    const remaining = sessionCfg.maxBookings - sessionBookingsCount;
    throw new Error(`该场次只剩${remaining}个名额，无法预约${personCount}人`);
  }

  // 创建预约 - 【手机号改造】同时保存 phone 字段
  const booking = await Booking.create({
    openid,
    phone,         // 新增：保存手机号
    date,
    session,       // 新增字段
    personCount,   // 新增字段
    status: "confirmed",
    time: "14:00", // 保留兼容性
  });

  return {
    code: 0,
    data: {
      id: booking.id,
      date: booking.date,
      session: booking.session,
      sessionName: SESSION_CONFIG[booking.session]?.name,
      timeRange: SESSION_CONFIG[booking.session]?.timeRange,
      personCount: booking.personCount,
      status: booking.status,
    },
  };
}

// 取消预约
async function cancelBooking(id, userInfo) {
  // 【手机号改造】userInfo 现在是 req.user 对象（包含 openid, phone, role）
  if (!userInfo || !userInfo.phone) {
    throw new Error("缺少用户标识");
  }
  
  const userPhone = userInfo.phone;

  const booking = await Booking.findOne({ where: { id } });

  if (!booking) {
    throw new Error("预约不存在");
  }

  // 【手机号改造】检查是否是当前用户的预约（使用 phone）
  if (booking.phone !== userPhone) {
    throw new Error("无权取消该预约");
  }

  // 检查是否可以取消（最晚提前一天）
  const bookingDate = new Date(booking.date);
  const today = new Date();
  
  // 只比较日期部分，忽略时间
  const bookingDateStr = getLocalDateString(bookingDate);
  const todayStr = getLocalDateString(today);
  
  // 计算日期差
  const diffTime = bookingDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // 如果预约日期就是今天，不能取消
  if (bookingDateStr === todayStr) {
    throw new Error("预约当天不能取消，请提前一天取消");
  }

  // 如果预约日期在过去，也不能取消
  if (diffDays < 0) {
    throw new Error("预约已过期，无法取消");
  }

  // 直接删除预约记录
  await Booking.destroy({
    where: { id }
  });

  return { code: 0, message: "预约已取消" };
}

// 获取我的预约 - 返回场次信息（【手机号改造】改用 phone 查询）
async function getMyBookings(phone) {
  if (!phone) {
    throw new Error("缺少用户标识");
  }

  // 查询所有有效预约（confirmed 和 checked_in）
  const bookings = await Booking.findAll({
    where: { 
      phone,  // 【手机号改造】改用 phone 查询
      status: { [Op.in]: ["confirmed", "checked_in"] }
    },
    order: [["date", "ASC"]],
  });

  const bookingList = bookings.map((booking) => {
    const session = booking.session || 'afternoon'; // 兼容旧数据
    const sessionConfig = SESSION_CONFIG[session];
    
    return {
      id: booking.id,
      date: booking.date,
      session: booking.session,
      sessionName: sessionConfig?.name || '下午',
      timeRange: sessionConfig?.timeRange || '14:00-18:00',
      personCount: booking.personCount || 1,
      time: booking.time,
      status: booking.status,
      createTime: booking.createTime,
    };
  });

  return { code: 0, data: bookingList };
}

module.exports = {
  getAvailableSlots,
  createBooking,
  cancelBooking,
  getMyBookings,
};