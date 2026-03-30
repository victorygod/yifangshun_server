const fs = require('fs');
const path = require('path');
const testHelpers = require('./test-helpers');

const testDir = path.join(__dirname, 'tests');

// 测试模块执行顺序（确保 test_login 先执行创建测试用户）
const testModules = [
  'test_login.js',
  'test_home_login.js',
  'test_permission.js',
  'test_booking.js',
  'test_prescription.js',
  'test_stock.js',
  'test_chat.js',
  'test_user_manager.js',
  'test_data_management.js',
  'test_system.js',
  'test_readonly_api.js'
];

async function runAll() {
  let total = { passed: 0, failed: 0, skipped: 0 };
  const failedTests = [];

  // 1. 先创建测试用户
  try {
    await testHelpers.createTestUsers();
  } catch (e) {
    console.error('❌ 创建测试用户失败:', e.message);
    process.exit(1);
  }

  // 2. 获取测试用户引用
  const testUsers = testHelpers.getTestUsers();

  // 3. 运行各个测试模块
  for (const file of testModules) {
    const modulePath = path.join(testDir, file);
    if (!fs.existsSync(modulePath)) {
      console.log('\n⚠️  跳过不存在的测试: ' + file);
      continue;
    }

    console.log('\n' + '='.repeat(60));
    console.log('📁 ' + file);
    console.log('='.repeat(60));

    try {
      const test = require(modulePath);
      const funcName = Object.keys(test).find(k => k.startsWith('run') && k.endsWith('Tests'));
      if (funcName) {
        // 检查函数是否需要 testUsers 参数
        const funcStr = test[funcName].toString();
        const needsTestUsers = funcStr.includes('testUsers') || funcStr.includes('users');

        let stats;
        if (needsTestUsers) {
          // 传递测试用户
          stats = await test[funcName](testUsers);
        } else {
          stats = await test[funcName]();
        }

        if (stats) {
          total.passed += stats.passed || 0;
          total.failed += stats.failed || 0;
          total.skipped += stats.skipped || 0;
          if (stats.failed > 0) {
            failedTests.push(file);
          }
        }
      } else {
        console.log('⚠️  未找到测试函数');
      }
    } catch (e) {
      console.error('❌ 测试模块加载失败:', e.message);
      failedTests.push(file);
    }
  }

  // 4. 清理测试用户
  await testHelpers.cleanupTestUsers();

  console.log('\n' + '='.repeat(60));
  console.log('📊 总计结果');
  console.log('='.repeat(60));
  console.log('通过: ' + total.passed + ' ✅');
  console.log('失败: ' + total.failed + ' ❌');
  console.log('跳过: ' + total.skipped + ' ⏭️');

  if (failedTests.length > 0) {
    console.log('\n失败的测试模块:');
    failedTests.forEach(f => console.log('  - ' + f));
    process.exit(1);
  }
}

runAll();