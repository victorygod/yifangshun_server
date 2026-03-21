// wrappers/db-wrapper.js
// 数据库操作抽象层 - 根据配置自动选择本地实现或线上实现

const config = require('./config');

// 根据模式选择实现
let dbImplementation;

if (config.isLocalMode) {
  console.log('使用本地数据库实现（JSON文件）');
  dbImplementation = require('./local-db');
} else {
  console.log('使用线上数据库实现（Sequelize + MySQL）');
  dbImplementation = require('../db');
}

// 导出模型和操作符
module.exports = {
  ...dbImplementation,
  // 如果需要额外导出的东西可以在这里添加
};