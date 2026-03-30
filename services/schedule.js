/**
 * 场次配置管理服务
 * 
 * 负责管理默认停诊规则和临时调整
 */

const { ScheduleConfig, Op } = require('../wrappers/db-wrapper');

// 默认停诊规则（与 booking.js 保持一致）
const DEFAULT_CLOSED_SESSIONS = {
  0: { morning: true, afternoon: false, evening: false },  // 周日
  1: { morning: true, afternoon: false, evening: false },  // 周一
  2: { morning: true, afternoon: true, evening: true },    // 周二
  3: { morning: true, afternoon: false, evening: false },  // 周三
  4: { morning: false, afternoon: true, evening: false },  // 周四
  5: { morning: true, afternoon: false, evening: false },  // 周五
  6: { morning: true, afternoon: false, evening: false }   // 周六
};

/**
 * 获取默认场次配置
 */
async function getDefaultConfig() {
  const configs = await ScheduleConfig.findAll({
    where: { type: 'default' }
  });
  
  // 如果没有默认配置，初始化
  if (configs.length === 0) {
    await initializeDefaultConfig();
    return await getDefaultConfig();
  }
  
  return configs;
}

/**
 * 初始化默认场次配置
 */
async function initializeDefaultConfig() {
  // 检查是否已有配置
  const existing = await ScheduleConfig.findOne({ where: { type: 'default' } });
  if (existing) return;
  
  // 逐个创建配置（兼容本地数据库）
  for (let day = 0; day <= 6; day++) {
    for (const session of ['morning', 'afternoon', 'evening']) {
      await ScheduleConfig.create({
        type: 'default',
        dayOfWeek: day,
        session,
        isOpen: !DEFAULT_CLOSED_SESSIONS[day][session],
        maxBookings: getSessionMaxBookings(session)
      });
    }
  }
}

/**
 * 获取场次最大预约人数
 */
function getSessionMaxBookings(session) {
  const config = {
    morning: 2,
    afternoon: 4,
    evening: 2
  };
  return config[session] || 4;
}

/**
 * 设置默认场次配置
 */
async function setDefaultConfig(dayOfWeek, session, isOpen, maxBookings = null) {
  if (dayOfWeek < 0 || dayOfWeek > 6) {
    throw new Error('星期参数无效（0-6）');
  }
  
  if (!['morning', 'afternoon', 'evening'].includes(session)) {
    throw new Error('场次参数无效');
  }
  
  // 先查找是否存在
  let config = await ScheduleConfig.findOne({
    where: { type: 'default', dayOfWeek, session }
  });
  
  if (!config) {
    // 不存在则创建
    config = await ScheduleConfig.create({
      type: 'default',
      dayOfWeek,
      session,
      isOpen,
      maxBookings: maxBookings || getSessionMaxBookings(session)
    });
  } else {
    // 存在则更新
    await config.update({ isOpen, maxBookings: maxBookings || config.maxBookings });
  }
  
  return { code: 0, message: '配置已保存' };
}

/**
 * 获取指定日期范围内的临时调整
 */
async function getOverrides(startDate, endDate) {
  const where = { type: 'override' };
  
  if (startDate || endDate) {
    where.date = {};
    if (startDate) where.date[Op.gte] = startDate;
    if (endDate) where.date[Op.lte] = endDate;
  }
  
  const overrides = await ScheduleConfig.findAll({
    where,
    order: [['date', 'ASC'], ['session', 'ASC']]
  });
  
  return overrides;
}

/**
 * 设置临时调整
 */
async function setOverride(date, session, isOpen, reason = '') {
  // 验证日期格式
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('日期格式无效，应为 YYYY-MM-DD');
  }
  
  if (!['morning', 'afternoon', 'evening', 'all'].includes(session)) {
    throw new Error('场次参数无效');
  }
  
  // 先查找是否存在
  let config = await ScheduleConfig.findOne({
    where: { type: 'override', date, session }
  });
  
  if (!config) {
    // 不存在则创建
    config = await ScheduleConfig.create({
      type: 'override',
      date,
      session,
      isOpen,
      reason
    });
  } else {
    // 存在则更新
    await config.update({ isOpen, reason });
  }
  
  return { code: 0, message: '调整已保存' };
}

/**
 * 删除临时调整
 */
async function deleteOverride(id) {
  const config = await ScheduleConfig.findOne({ where: { id } });
  
  if (!config) {
    throw new Error('配置不存在');
  }
  
  if (config.type !== 'override') {
    throw new Error('只能删除临时调整');
  }
  
  await config.destroy();
  return { code: 0, message: '调整已删除' };
}

/**
 * 获取某日某场次的实际状态
 * 优先级：临时调整 > 默认规则
 */
async function getSessionStatus(date, session) {
  const dateObj = new Date(date);
  const dayOfWeek = dateObj.getDay();
  
  // 1. 检查临时调整
  let override = await ScheduleConfig.findOne({
    where: { 
      type: 'override',
      date,
      session: { [Op.in]: [session, 'all'] }  // 精确场次或全天
    },
    order: [['session', 'DESC']]  // 'all' 优先级高于具体场次
  });
  
  // 2. 如果没有临时调整，使用默认规则
  if (!override) {
    const defaultConfig = await ScheduleConfig.findOne({
      where: { type: 'default', dayOfWeek, session }
    });
    
    if (defaultConfig) {
      return {
        isOpen: defaultConfig.isOpen,
        maxBookings: defaultConfig.maxBookings,
        source: 'default'
      };
    }
  } else {
    // 临时调整覆盖默认规则
    return {
      isOpen: override.isOpen,
      maxBookings: override.maxBookings || getSessionMaxBookings(session),
      source: 'override',
      reason: override.reason
    };
  }
  
  // 默认返回（理论上不会到达这里）
  return {
    isOpen: !DEFAULT_CLOSED_SESSIONS[dayOfWeek][session],
    maxBookings: getSessionMaxBookings(session),
    source: 'fallback'
  };
}

module.exports = {
  getDefaultConfig,
  setDefaultConfig,
  getOverrides,
  setOverride,
  deleteOverride,
  getSessionStatus
};