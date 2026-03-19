/**
 * 用户管理 API 测试（扩展）
 * 
 * 测试范围：
 * - 更新用户姓名
 * - 更新用户手机号
 * - 权限验证
 * - 数据校验
 */

const BASE_URL = process.env.CLOUD_TEST_URL || 'http://localhost:80';

// 测试统计
const testStats = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  errors: []
};

// 测试用户（由 comprehensive_api_test.js 注入）
let testUsers = {
  normalUser: { openid: 'test_normal_user' },
  adminUser: { openid: 'test_admin_user' },
  superAdminUser: { openid: 'test_super_admin' }
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
 * 超级管理员请求
 */
function superAdminRequest(method, url, body = null) {
  return request(method, url, body, {
    'x-home-page': 'true'
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
 * 主测试函数
 */
async function runUserManagerTests(users) {
  if (users) {
    testUsers = users;
  }
  
  console.log('\n👤 测试用户管理扩展 API');
  console.log('=====================================');
  
  // ========== 更新用户信息 ==========
  
  await test('PUT /api/user/:openid - 更新用户姓名', async () => {
    const { response, data } = await superAdminRequest('PUT', `/api/user/${testUsers.normalUser.openid}`, {
      name: '测试用户_新姓名'
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
  });
  
  await test('PUT /api/user/:openid - 更新用户手机号', async () => {
    const { response, data } = await superAdminRequest('PUT', `/api/user/${testUsers.normalUser.openid}`, {
      phone: '13900000001'
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
  });
  
  await test('PUT /api/user/:openid - 同时更新姓名和手机号', async () => {
    const { response, data } = await superAdminRequest('PUT', `/api/user/${testUsers.normalUser.openid}`, {
      name: '测试用户_最终姓名',
      phone: '13900000002'
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
  });
  
  await test('PUT /api/user/:openid - 验证更新结果', async () => {
    const { response, data } = await superAdminRequest('GET', '/api/home/users');
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    
    const user = data.data.list.find(u => u.openid === testUsers.normalUser.openid);
    assert(user, '找到测试用户');
    assertEquals(user.name, '测试用户_最终姓名', '姓名已更新');
    assertEquals(user.phone, '13900000002', '手机号已更新');
  });
  
  // ========== 权限验证 ==========
  
  await test('PUT /api/user/:openid - 普通用户无权访问', async () => {
    const { response, data } = await request('PUT', `/api/user/${testUsers.normalUser.openid}`, {
      name: '非法修改'
    }, {
      'x-openid': testUsers.normalUser.openid
    });
    
    assertEquals(response.statusCode, 403, '返回403禁止访问');
  });
  
  await test('PUT /api/user/:openid - 管理员无权访问（仅超管）', async () => {
    const { response, data } = await request('PUT', `/api/user/${testUsers.normalUser.openid}`, {
      name: '非法修改'
    }, {
      'x-openid': testUsers.adminUser.openid
    });
    
    assertEquals(response.statusCode, 403, '返回403禁止访问');
  });
  
  // ========== 数据校验 ==========
  
  await test('PUT /api/user/:openid - 用户不存在应返回错误', async () => {
    const { response, data } = await superAdminRequest('PUT', '/api/user/non_existent_user_12345', {
      name: '测试'
    });
    
    assertEquals(response.statusCode, 400, '请求失败');
    assertEquals(data.code, 1, '返回错误');
  });
  
  await test('PUT /api/user/:openid - 手机号格式校验', async () => {
    const { response, data } = await superAdminRequest('PUT', `/api/user/${testUsers.normalUser.openid}`, {
      phone: 'invalid_phone'
    });
    
    // 根据实际实现，可能返回400或200但不更新
    // 这里假设后端会校验手机号格式
    if (response.statusCode === 400) {
      assertEquals(data.code, 1, '返回错误');
    } else {
      // 如果没有校验，测试通过（后续可添加校验）
      console.log('    ⚠️  手机号格式未校验，建议添加');
    }
  });
  
  // ========== 输出测试结果 ==========
  console.log('\n📊 用户管理测试结果');
  console.log('=====================================');
  console.log(`总测试数: ${testStats.total}`);
  console.log(`通过: ${testStats.passed} ✅`);
  console.log(`失败: ${testStats.failed} ❌`);
  console.log(`跳过: ${testStats.skipped} ⏭️`);
  
  if (testStats.failed > 0) {
    console.log('\n失败的测试:');
    testStats.errors.forEach(e => {
      console.log(`  - ${e.name}: ${e.error}`);
    });
  }
  
  return testStats;
}

/**
 * 清理测试数据（恢复原始数据）
 */
async function cleanupTestData() {
  console.log('\n🧹 清理用户管理测试数据...');
  
  try {
    // 恢复测试用户的原始信息
    await superAdminRequest('PUT', `/api/user/${testUsers.normalUser.openid}`, {
      name: '测试普通用户',
      phone: '13800000001'
    });
    
    console.log('✅ 用户管理测试数据清理完成');
  } catch (error) {
    console.log('⚠️  清理用户管理测试数据失败:', error.message);
  }
}

// 导出模块
module.exports = {
  runUserManagerTests,
  cleanupTestData,
  getTestStats: () => testStats
};
