/**
 * 出诊配置热更新加载器
 *
 * 监听配置文件变化，自动重新加载配置
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'schedule_config.json');

let scheduleConfig = null;

/**
 * 加载配置文件
 */
function loadConfig() {
  try {
    const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
    scheduleConfig = JSON.parse(content);
    console.log('[Schedule Config] 配置加载成功');
  } catch (error) {
    console.error('[Schedule Config] 配置加载失败:', error.message);
    // 使用默认配置
    scheduleConfig = {
      default_schedule: {
        0: { morning: false, afternoon: true, evening: true },
        1: { morning: false, afternoon: true, evening: true },
        2: { morning: false, afternoon: false, evening: false },
        3: { morning: false, afternoon: true, evening: true },
        4: { morning: true, afternoon: false, evening: true },
        5: { morning: false, afternoon: true, evening: true },
        6: { morning: false, afternoon: true, evening: true }
      },
      max_bookings: {
        morning: 2,
        afternoon: 4,
        evening: 2
      }
    };
  }
}

// 初始加载
loadConfig();

// 监听文件变化
fs.watch(CONFIG_PATH, (eventType) => {
  if (eventType === 'change') {
    console.log('[Schedule Config] 检测到配置文件变化，重新加载...');
    loadConfig();
  }
});

/**
 * 获取完整配置
 */
function getConfig() {
  return scheduleConfig;
}

/**
 * 获取默认出诊规则
 * @returns {Object} dayOfWeek -> session -> isOpen
 */
function getDefaultSchedule() {
  return scheduleConfig.default_schedule;
}

/**
 * 获取场次最大预约人数
 */
function getMaxBookings(session) {
  return scheduleConfig.max_bookings[session] || 4;
}

/**
 * 获取某日某场次的默认状态
 */
function getDefaultSessionStatus(dayOfWeek, session) {
  const daySchedule = scheduleConfig.default_schedule[dayOfWeek];
  if (daySchedule && daySchedule[session] !== undefined) {
    return {
      isOpen: daySchedule[session],
      maxBookings: scheduleConfig.max_bookings[session] || 4
    };
  }
  return { isOpen: true, maxBookings: 4 };
}

/**
 * 保存配置到文件
 */
function saveConfig(newConfig) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf-8');
    scheduleConfig = newConfig;
    console.log('[Schedule Config] 配置保存成功');
    return { success: true };
  } catch (error) {
    console.error('[Schedule Config] 配置保存失败:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  getConfig,
  getDefaultSchedule,
  getMaxBookings,
  getDefaultSessionStatus,
  saveConfig
};