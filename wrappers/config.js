// wrappers/config.js

// 模式配置：local | production
const MODE = 'local';

module.exports = {
  // 当前模式
  isLocalMode: MODE === 'local',
  
  // 数据库配置
  database: {
    local: {
      dataDir: './local-data'
    },
    production: {
      // 生产环境使用Sequelize，配置从环境变量读取
      host: process.env.MYSQL_ADDRESS?.split(':')[0] || 'localhost',
      port: process.env.MYSQL_ADDRESS?.split(':')[1] || 3306,
      username: process.env.MYSQL_USERNAME || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: 'nodejs_demo'
    }
  }
};