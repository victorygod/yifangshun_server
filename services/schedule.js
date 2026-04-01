/**
 * 场次配置管理服务
 *
 * 负责管理默认停诊规则和临时调整
 * 默认规则存储在配置文件中（支持热更新）
 * 临时调整存储在数据库中
 */

const { ScheduleConfig, Op } = require('../wrappers/db-wrapper');
const scheduleConfigLoader = require('../config/schedule_config_loader');

/**
 * 获取默认场次配置
 * 从配置文件读取，返回数组格式（兼容前端）
 */
async function getDefaultConfig() {
  const schedule = scheduleConfigLoader.getDefaultSchedule();
  const maxBookings = scheduleConfigLoader.getConfig().max_bookings;

  const result = [];
  for (let day = 0; day <= 6; day++) {
    for (const session of ['morning', 'afternoon', 'evening']) {
      result.push({
        dayOfWeek: day,
        session,
        isOpen: schedule[day] ? schedule[day][session] : true,
        maxBookings: maxBookings[session] || 4
      });
    }
  }

  return result;
}

/**
 * 设置默认场次配置
 * 保存到配置文件
 */
async function setDefaultConfig(dayOfWeek, session, isOpen) {
  if (dayOfWeek < 0 || dayOfWeek > 6) {
    throw new Error('星期参数无效（0-6）');
  }

  if (!['morning', 'afternoon', 'evening'].includes(session)) {
    throw new Error('场次参数无效');
  }

  const config = scheduleConfigLoader.getConfig();

  // 确保该天的配置存在
  if (!config.default_schedule[dayOfWeek]) {
    config.default_schedule[dayOfWeek] = {
      morning: true,
      afternoon: true,
      evening: true
    };
  }

  // 更新指定场次
  config.default_schedule[dayOfWeek][session] = isOpen;

  // 保存到文件
  const result = scheduleConfigLoader.saveConfig(config);
  if (!result.success) {
    throw new Error(result.error || '保存配置失败');
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

  // 2. 如果没有临时调整，使用默认规则（从配置文件）
  if (!override) {
    const defaultStatus = scheduleConfigLoader.getDefaultSessionStatus(dayOfWeek, session);
    return {
      isOpen: defaultStatus.isOpen,
      maxBookings: defaultStatus.maxBookings,
      source: 'default'
    };
  } else {
    // 临时调整覆盖默认规则
    return {
      isOpen: override.isOpen,
      maxBookings: scheduleConfigLoader.getMaxBookings(session),
      source: 'override',
      reason: override.reason
    };
  }
}

module.exports = {
  getDefaultConfig,
  setDefaultConfig,
  getOverrides,
  setOverride,
  deleteOverride,
  getSessionStatus
};