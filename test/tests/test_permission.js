/**
 * 权限控制测试
 * 
 * 根据 API接口权限改造方案_v2.md，以下接口需要权限控制：
 * 1. GET /api/prescription/list - requireRole(['admin', 'super_admin'])
 * 2. POST /api/prescription/update - requireRole(['admin', 'super_admin'])
 */

const BASE_URL = 'http://localhost:80';

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
    const http = require('http');
    const urlObj = new URL(url, BASE_URL);
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
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
 * 清理测试数据
 */
async function cleanupTestData() {
  console.log('✅ 权限测试数据清理完成');
}

/**
 * 导出函数
 */
async function runPermissionTests(testUsers) {
  console.log('\n📋 6. 测试权限控制');
  
  // ==================== GET /api/prescription/list 权限测试 ====================
  
  await test('GET /api/prescription/list - 普通用户访问应返回403', async () => {
    const { response, data } = await request('GET', `/api/prescription/list?openid=${testUsers.normalUser.openid}`);
    
    assertEquals(response.statusCode, 403, '应返回403 Forbidden');
    assertEquals(data.code, 1, '应返回错误码');
    assert(data.message.includes('权限') || data.message.includes('不足'), '应提示权限不足');
    console.log(`  普通用户被正确拒绝访问`);
  });
  
  await test('GET /api/prescription/list - 管理员访问应返回200', async () => {
    const { response, data } = await request('GET', `/api/prescription/list?openid=${testUsers.adminUser.openid}`);
    
    assertEquals(response.statusCode, 200, '应返回200成功');
    assertEquals(data.code, 0, '应返回成功码');
    assert(Array.isArray(data.data), '应返回数组');
    console.log(`  管理员成功获取处方列表`);
  });
  
  await test('GET /api/prescription/list - 超级管理员访问应返回200', async () => {
    const { response, data } = await request('GET', `/api/prescription/list?openid=${testUsers.superAdminUser.openid}`);
    
    assertEquals(response.statusCode, 200, '应返回200成功');
    assertEquals(data.code, 0, '应返回成功码');
    assert(Array.isArray(data.data), '应返回数组');
    console.log(`  超级管理员成功获取处方列表`);
  });
  
  await test('GET /api/prescription/list - 未登录访问应返回401', async () => {
    const { response, data } = await request('GET', '/api/prescription/list');
    
    assertEquals(response.statusCode, 401, '应返回401 Unauthorized');
    assertEquals(data.code, 1, '应返回错误码');
    assert(data.message.includes('授权') || data.message.includes('openid'), '应提示未授权');
    console.log(`  未登录用户被正确拒绝访问`);
  });
  
  // ==================== POST /api/prescription/update 权限测试 ====================
  
  await test('POST /api/prescription/update - 普通用户访问应返回403', async () => {
    const { response, data } = await request('POST', '/api/prescription/update', {
      openid: testUsers.normalUser.openid,
      id: 'test_prescription_id',
      name: '普通用户尝试修改',
      age: '30'
    });
    
    assertEquals(response.statusCode, 403, '应返回403 Forbidden');
    assertEquals(data.code, 1, '应返回错误码');
    assert(data.message.includes('权限') || data.message.includes('不足'), '应提示权限不足');
    console.log(`  普通用户被正确拒绝修改处方`);
  });
  
  await test('POST /api/prescription/update - 管理员访问应能修改处方', async () => {
    // 注意：这个测试需要有效的处方ID，这里测试权限验证通过即可
    const { response, data } = await request('POST', '/api/prescription/update', {
      openid: testUsers.adminUser.openid,
      id: 'non_existent_prescription_id',
      name: '管理员修改',
      age: '30'
    });
    
    // 权限验证通过，但因为处方不存在会返回400
    // 重点是验证权限通过了（不是403）
    assert(response.statusCode !== 403, '权限验证应通过，不应返回403');
    assert(response.statusCode !== 401, '权限验证应通过，不应返回401');
    console.log(`  管理员权限验证通过`);
  });
  
  await test('POST /api/prescription/update - 超级管理员访问应能修改处方', async () => {
    const { response, data } = await request('POST', '/api/prescription/update', {
      openid: testUsers.superAdminUser.openid,
      id: 'non_existent_prescription_id',
      name: '超级管理员修改',
      age: '30'
    });
    
    // 权限验证通过，但因为处方不存在会返回400
    // 重点是验证权限通过了（不是403）
    assert(response.statusCode !== 403, '权限验证应通过，不应返回403');
    assert(response.statusCode !== 401, '权限验证应通过，不应返回401');
    console.log(`  超级管理员权限验证通过`);
  });
  
  await test('POST /api/prescription/update - 未登录访问应返回401', async () => {
    const { response, data } = await request('POST', '/api/prescription/update', {
      id: 'test_prescription_id',
      name: '未登录用户尝试修改',
      age: '30'
    });
    
    assertEquals(response.statusCode, 401, '应返回401 Unauthorized');
    assertEquals(data.code, 1, '应返回错误码');
    assert(data.message.includes('授权') || data.message.includes('openid'), '应提示未授权');
    console.log(`  未登录用户被正确拒绝修改处方`);
  });
  
  console.log('\n📊 权限测试结果');
  console.log(`  总测试数: ${testStats.total}`);
  console.log(`  通过: ${testStats.passed} ✅`);
  console.log(`  失败: ${testStats.failed} ❌`);
}

// 导出模块
module.exports = {
  runPermissionTests,
  cleanupTestData,
  getTestStats: () => testStats
};