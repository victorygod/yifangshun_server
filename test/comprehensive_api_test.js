/**
 * 主测试脚本 - 运行所有测试
 * 
 * 使用方法：
 * node test/comprehensive_api_test.js           # 本地测试
 * node test/comprehensive_api_test.js --cloud   # 云端测试
 */

// 根据参数选择测试目标
const isCloudTest = process.argv.includes('--cloud');
const BASE_URL = isCloudTest 
  ? 'https://express-9kv9-232788-7-1410937198.sh.run.tcloudbase.com'
  : 'http://localhost:80';

// 设置环境变量供子测试模块使用
if (isCloudTest) {
  process.env.CLOUD_TEST_URL = BASE_URL;
}

console.log(`\n🌐 测试目标: ${BASE_URL}`);
if (isCloudTest) {
  console.log('📡 云端测试模式');
} else {
  console.log('💻 本地测试模式');
}
console.log('');

// 导入测试模块
const testLogin = require('./tests/test_login');
const testHomeLogin = require('./tests/test_home_login'); // 新增：首页登录测试
const testBooking = require('./tests/test_booking');
const testPrescription = require('./tests/test_prescription');
const testChat = require('./tests/test_chat');
const testSystem = require('./tests/test_system');
const testPermission = require('./tests/test_permission');
const testUserManager = require('./tests/test_user_manager');
const testDbManager = require('./tests/test_db_manager');
// 库存管理测试
const testStock = require('./tests/test_stock');
// 数据表管理改造测试
const testDataManagement = require('./tests/test_data_management');

// 全局测试统计
const globalStats = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  errors: []
};

/**
 * 主测试流程
 */
async function runAllTests() {
  console.log('========================================');
  console.log('易方顺诊所助手 - 全面API测试');
  console.log('========================================');
  
  try {
    // 1. 测试登录相关API
    await testLogin.runLoginTests();
    const loginStats = testLogin.getTestStats();
    updateGlobalStats(loginStats);
    
    // 1.5 测试首页登录（新增）
    await testHomeLogin.runHomeLoginTests();
    const homeLoginStats = testHomeLogin.getTestStats ? testHomeLogin.getTestStats() : { total: 0, passed: 0, failed: 0 };
    updateGlobalStats(homeLoginStats);
    
    // 2. 测试预约管理API
    const testUsers = testLogin.getTestUsers();
    await testBooking.runBookingTests(testUsers);
    const bookingStats = testBooking.getTestStats();
    updateGlobalStats(bookingStats);
    
    // 3. 测试处方识别API
    await testPrescription.runPrescriptionTests(testUsers);
    const prescriptionStats = testPrescription.getTestStats();
    updateGlobalStats(prescriptionStats);
    
    // 4. 测试AI咨询API
    await testChat.runChatTests(testUsers);
    const chatStats = testChat.getTestStats();
    updateGlobalStats(chatStats);
    
    // 5. 测试系统接口
    await testSystem.runSystemTests(testUsers);
    const systemStats = testSystem.getTestStats();
    updateGlobalStats(systemStats);
    
    // 6. 测试权限控制
    await testPermission.runPermissionTests(testUsers);
    const permissionStats = testPermission.getTestStats();
    updateGlobalStats(permissionStats);
    
    // 7. 测试用户管理扩展（P0）
    await testUserManager.runUserManagerTests(testUsers);
    const userManagerStats = testUserManager.getTestStats();
    updateGlobalStats(userManagerStats);
    
    // 8. 测试数据库管理扩展（P0）
    await testDbManager.runDbManagerTests(testUsers);
    const dbManagerStats = testDbManager.getTestStats();
    updateGlobalStats(dbManagerStats);
    
    // 9. 库存管理测试
    await testStock.runStockTests(testUsers);
    const stockStats = testStock.getTestStats();
    updateGlobalStats(stockStats);
    
    // 10. 数据表管理改造测试（待功能实现后启用）
    // await testDataManagement.runDataManagementTests(testUsers);
    // const dataManagementStats = testDataManagement.getTestStats();
    // updateGlobalStats(dataManagementStats);
    
    // 清理所有测试数据
    console.log('\n========================================');
    console.log('清理测试数据');
    console.log('========================================');
    
    await testLogin.cleanupTestData();
    await testBooking.cleanupTestData();
    await testPrescription.cleanupTestData();
    await testChat.cleanupTestData();
    await testSystem.cleanupTestData();
    await testPermission.cleanupTestData();
    await testUserManager.cleanupTestData();
    await testDbManager.cleanupTestData();
    await testStock.cleanupTestData();
    // testDataManagement 的清理在模块内部完成
    
    // 输出测试结果
    printTestResults();
    
  } catch (error) {
    console.error('\n❌ 测试运行失败:', error.message);
    
    // 尝试清理测试数据
    try {
      await testLogin.cleanupTestData();
      await testBooking.cleanupTestData();
      await testPrescription.cleanupTestData();
      await testChat.cleanupTestData();
      await testSystem.cleanupTestData();
      await testPermission.cleanupTestData();
      await testUserManager.cleanupTestData();
      await testDbManager.cleanupTestData();
    } catch (e) {
      console.error('清理测试数据失败:', e.message);
    }
    
    process.exit(1);
  }
}

/**
 * 更新全局测试统计
 */
function updateGlobalStats(moduleStats) {
  globalStats.total += moduleStats.total;
  globalStats.passed += moduleStats.passed;
  globalStats.failed += moduleStats.failed;
  globalStats.skipped += moduleStats.skipped;
  globalStats.errors.push(...moduleStats.errors);
}

/**
 * 输出测试结果
 */
function printTestResults() {
  console.log('\n========================================');
  console.log('测试结果汇总');
  console.log('========================================');
  console.log(`总测试数: ${globalStats.total}`);
  console.log(`通过: ${globalStats.passed} ✅`);
  console.log(`失败: ${globalStats.failed} ❌`);
  console.log(`跳过: ${globalStats.skipped} ⏭️`);
  
  if (globalStats.failed > 0) {
    console.log('\n失败的测试:');
    globalStats.errors.forEach(err => {
      console.log(`  - ${err.name}: ${err.error}`);
    });
  }
  
  const passRate = ((globalStats.passed / globalStats.total) * 100).toFixed(1);
  console.log(`\n测试通过率: ${passRate}%`);
  console.log('========================================');
  
  process.exit(globalStats.failed > 0 ? 1 : 0);
}

// 运行测试
runAllTests().catch(error => {
  console.error('测试运行失败:', error);
  process.exit(1);
});