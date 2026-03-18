/**
 * 处方API独立测试脚本
 * 
 * 使用方法：
 * node test/test_prescription_only.js           # 本地测试
 * node test/test_prescription_only.js --cloud   # 云端测试
 */

const isCloudTest = process.argv.includes('--cloud');
const BASE_URL = isCloudTest 
  ? 'https://express-9kv9-232788-7-1410937198.sh.run.tcloudbase.com'
  : 'http://localhost:80';

process.env.CLOUD_TEST_URL = BASE_URL;

console.log(`\n🌐 测试目标: ${BASE_URL}`);
console.log(isCloudTest ? '📡 云端测试模式' : '💻 本地测试模式');
console.log('');

// 使用固定的已存在用户（云端测试时使用）
const testUsers = {
  normalUser: { openid: 'o-eQz3TYzw7PJFltoyjntVijNt88' },
  adminUser: { openid: 'o-eQz3TYzw7PJFltoyjntVijNt88' },
  superAdminUser: { openid: 'o-eQz3TYzw7PJFltoyjntVijNt88' }
};

// 导入处方测试
const testPrescription = require('./tests/test_prescription');

// 运行测试
async function run() {
  try {
    await testPrescription.runPrescriptionTests(testUsers);
    const stats = testPrescription.getTestStats();
    
    console.log('\n========================================');
    console.log('处方测试结果汇总');
    console.log('========================================');
    console.log(`总测试数: ${stats.total}`);
    console.log(`通过: ${stats.passed} ✅`);
    console.log(`失败: ${stats.failed} ❌`);
    console.log(`跳过: ${stats.skipped} ⏭️`);
    console.log(`\n测试通过率: ${((stats.passed / stats.total) * 100).toFixed(1)}%`);
    
    if (stats.failed > 0) {
      console.log('\n失败的测试:');
      stats.errors.forEach(e => {
        console.log(`  - ${e.name}: ${e.error}`);
      });
      process.exit(1);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('测试执行失败:', error);
    process.exit(1);
  }
}

run();
