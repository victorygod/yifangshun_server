// config/llm_config_loader.js
// 大模型配置加载器 - 支持热更新

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'llm_api_config.json');

// 缓存的配置
let cachedConfig = null;

// 加载配置
function loadConfig() {
  try {
    const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
    cachedConfig = JSON.parse(content);
    console.log('[LLM Config] 配置已加载');
    return cachedConfig;
  } catch (error) {
    console.error('[LLM Config] 配置加载失败:', error.message);
    // 返回空配置，避免服务崩溃
    return {
      prescription_ocr_llm_config: {},
      chat_llm_config: {}
    };
  }
}

// 初始加载
loadConfig();

// 监听文件变化，实现热更新
fs.watch(CONFIG_PATH, (eventType) => {
  if (eventType === 'change') {
    console.log('[LLM Config] 检测到配置文件变化，重新加载...');
    loadConfig();
  }
});

// 获取配置
function getPrescriptionOcrConfig() {
  return cachedConfig?.prescription_ocr_llm_config || {};
}

function getChatConfig() {
  return cachedConfig?.chat_llm_config || {};
}

// 导出 getter 函数（不直接导出对象，确保每次获取最新值）
module.exports = {
  get prescription_ocr_llm_config() {
    return getPrescriptionOcrConfig();
  },
  get chat_llm_config() {
    return getChatConfig();
  },
  // 手动重新加载
  reload: loadConfig
};