// wrappers/config.js

// 模式配置：根据环境变量自动判断
// 如果有 MYSQL_ADDRESS 环境变量，说明在云托管环境，使用生产模式
// 否则使用本地模式（JSON 文件存储）
const MODE = process.env.MYSQL_ADDRESS ? 'production' : 'local';

console.log('========================================');
console.log('服务模式配置');
console.log(`  MYSQL_ADDRESS: ${process.env.MYSQL_ADDRESS || '(未设置)'}`);
console.log(`  当前模式: ${MODE}`);
console.log(`  isLocalMode: ${MODE === 'local'}`);
console.log('========================================');

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