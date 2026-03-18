/**
 * 登录相关API测试
 */

const { User } = require('../../wrappers/db-wrapper');
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
          resolve({ response: res, data: data });
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
 * 数据库操作函数
 */
async function createTestUser(user) {
  user.openid = 'user_' + Math.random().toString(36).substr(2, 20);
  
  await User.create({
    openid: user.openid,
    code: user.code,
    name: user.name,
    phone: user.phone,
    isNewUser: false,
    role: user.role
  });
  
  return user.openid;
}

async function setUserRole(openid, role) {
  const user = await User.findByPk(openid);
  if (!user) {
    throw new Error('用户不存在');
  }
  
  await User.update({ role }, { where: { openid } });
}

/**
 * 清理测试数据
 */
async function cleanupTestData() {
  try {
    for (const userKey in testUsers) {
      const user = testUsers[userKey];
      if (user && user.openid) {
        await User.destroy({ where: { openid: user.openid } });
      }
    }
    console.log('✅ 登录测试数据清理完成');
  } catch (error) {
    console.log('⚠️  清理登录测试数据失败:', error.message);
  }
}

/**
 * 导出函数
 */
async function runLoginTests() {
  console.log('\n📋 1. 测试登录相关API');
  
  // 创建测试用户
  await test('创建测试用户', async () => {
    const normalUser = {
      code: 'test_normal_user_' + Date.now(),
      name: '普通用户',
      phone: '13800138001',
      role: 'user'
    };
    
    const adminUser = {
      code: 'test_admin_user_' + Date.now(),
      name: '管理员',
      phone: '13800138002',
      role: 'admin'
    };
    
    const superAdminUser = {
      code: 'test_super_admin_user_' + Date.now(),
      name: '超级管理员',
      phone: '13800138003',
      role: 'super_admin'
    };
    
    testUsers.normalUser = { ...normalUser, openid: await createTestUser(normalUser) };
    testUsers.adminUser = { ...adminUser, openid: await createTestUser(adminUser) };
    await setUserRole(testUsers.adminUser.openid, 'admin');
    testUsers.superAdminUser = { ...superAdminUser, openid: await createTestUser(superAdminUser) };
    await setUserRole(testUsers.superAdminUser.openid, 'super_admin');
    
    console.log(`  普通用户: ${testUsers.normalUser.openid}`);
    console.log(`  管理员: ${testUsers.adminUser.openid}`);
    console.log(`  超级管理员: ${testUsers.superAdminUser.openid}`);
  });
  
  // POST /api/bind-user-info
  await test('POST /api/bind-user-info - 绑定用户信息', async () => {
    const { response, data } = await request('POST', '/api/bind-user-info', {
      openid: testUsers.normalUser.openid,
      name: '测试用户',
      phone: '13800138001'
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '绑定成功');
  });
  
  // POST /api/bind-phone
  await test('POST /api/bind-phone - 绑定手机号', async () => {
    const { response, data } = await request('POST', '/api/bind-phone', {
      openid: testUsers.normalUser.openid,
      phone: '13800138001'
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '绑定成功');
  });
  
  // POST /api/check-admin
  await test('POST /api/check-admin - 普通用户检查', async () => {
    const { response, data } = await request('POST', '/api/check-admin', {
      openid: testUsers.normalUser.openid
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assertEquals(data.data.isAdmin, false, '不是管理员');
  });
  
  await test('POST /api/check-admin - 管理员检查', async () => {
    const { response, data } = await request('POST', '/api/check-admin', {
      openid: testUsers.adminUser.openid
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assertEquals(data.data.isAdmin, true, '是管理员');
  });
  
  await test('POST /api/check-admin - 超级管理员检查', async () => {
    const { response, data } = await request('POST', '/api/check-admin', {
      openid: testUsers.superAdminUser.openid
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assertEquals(data.data.isAdmin, true, '是管理员');
  });
  
  console.log('\n📊 登录测试结果');
  console.log(`  总测试数: ${testStats.total}`);
  console.log(`  通过: ${testStats.passed} ✅`);
  console.log(`  失败: ${testStats.failed} ❌`);
}

// 导出模块
module.exports = {
  runLoginTests,
  cleanupTestData,
  getTestUsers: () => testUsers,
  getTestStats: () => testStats
};
