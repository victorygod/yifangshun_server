/**
 * 测试工具模块
 *
 * 提供共享的测试用户管理和工具函数
 */

const { User } = require('../wrappers/db-wrapper');
const BASE_URL = process.env.CLOUD_TEST_URL || 'http://localhost:80';

// 测试用户
const testUsers = {
  normalUser: null,
  adminUser: null,
  superAdminUser: null
};

// 测试统计
const testStats = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  errors: []
};

/**
 * HTTP请求工具函数
 */
function request(method, url, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const isHttps = BASE_URL.startsWith('https');
    const http = isHttps ? require('https') : require('http');
    const urlObj = new URL(url, BASE_URL);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ response: res, data: jsonData });
        } catch (error) {
          resolve({ response: res,  data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

/**
 * 超级管理员请求（使用 home_super_admin 手机号）
 */
function superAdminRequest(method, url, body = null) {
  return request(method, url, body, {
    'x-phone': 'home_super_admin'
  });
}

/**
 * 测试工具函数
 */
async function test(name, testFn) {
  testStats.total++;
  console.log(`\n🧪 测试: ${name}`);

  try {
    const result = await testFn();
    if (result === 'skipped') {
      testStats.skipped++;
      console.log('⏭️  跳过');
      return 'skipped';
    }

    testStats.passed++;
    console.log('✅ 通过');
    return 'passed';
  } catch (error) {
    testStats.failed++;
    testStats.errors.push({ name, error: error.message });
    console.log(`❌ 失败: ${error.message}`);
    return 'failed';
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || '断言失败');
  }
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `期望 ${expected}，实际得到 ${actual}`);
  }
}

/**
 * 创建测试用户
 */
async function createTestUsers() {
  console.log('📋 创建测试用户...');

  // 清理可能存在的脏数据
  await User.destroy({ where: { phone: '13800138001' } });
  await User.destroy({ where: { phone: '13800138002' } });
  await User.destroy({ where: { phone: '13800138003' } });

  // 创建普通用户
  const normalOpenid = 'user_' + Math.random().toString(36).substr(2, 20);
  await User.create({
    openid: normalOpenid,
    code: 'test_normal_user_' + Date.now(),
    name: '普通用户',
    phone: '13800138001',
    isNewUser: false,
    role: 'user'
  });
  testUsers.normalUser = { openid: normalOpenid, phone: '13800138001' };

  // 创建管理员
  const adminOpenid = 'user_' + Math.random().toString(36).substr(2, 20);
  await User.create({
    openid: adminOpenid,
    code: 'test_admin_user_' + Date.now(),
    name: '管理员',
    phone: '13800138002',
    isNewUser: false,
    role: 'admin'
  });
  testUsers.adminUser = { openid: adminOpenid, phone: '13800138002' };

  // 创建超级管理员
  const superAdminOpenid = 'user_' + Math.random().toString(36).substr(2, 20);
  await User.create({
    openid: superAdminOpenid,
    code: 'test_super_admin_user_' + Date.now(),
    name: '超级管理员',
    phone: '13800138003',
    isNewUser: false,
    role: 'super_admin'
  });
  testUsers.superAdminUser = { openid: superAdminOpenid, phone: '13800138003' };

  console.log(`  普通用户: ${testUsers.normalUser.openid}`);
  console.log(`  管理员: ${testUsers.adminUser.openid}`);
  console.log(`  超级管理员: ${testUsers.superAdminUser.openid}`);
  console.log('✅ 测试用户创建完成');

  return testUsers;
}

/**
 * 清理测试用户
 */
async function cleanupTestUsers() {
  try {
    for (const userKey in testUsers) {
      const user = testUsers[userKey];
      if (user && user.openid) {
        await User.destroy({ where: { openid: user.openid } });
      }
    }
    console.log('✅ 测试用户清理完成');
  } catch (error) {
    console.log('⚠️  清理测试用户失败:', error.message);
  }
}

/**
 * 重置测试统计
 */
function resetTestStats() {
  testStats.total = 0;
  testStats.passed = 0;
  testStats.failed = 0;
  testStats.skipped = 0;
  testStats.errors = [];
}

/**
 * 获取测试统计
 */
function getTestStats() {
  return { ...testStats };
}

/**
 * 获取测试用户
 */
function getTestUsers() {
  return testUsers;
}

module.exports = {
  // HTTP 工具
  request,
  superAdminRequest,

  // 测试工具
  test,
  assert,
  assertEquals,

  // 测试用户管理
  createTestUsers,
  cleanupTestUsers,
  getTestUsers,

  // 测试统计
  resetTestStats,
  getTestStats,
  testStats
};