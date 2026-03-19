/**
 * 数据库管理 API 测试（扩展）
 * 
 * 测试范围：
 * - 新增记录
 * - 更新记录
 * - 删除记录
 * - 分页查询
 * - 字段保护
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

// 测试数据
const testData = {
  testRecordId: null,
  testTableName: 'prescriptions' // 使用处方表测试
};

// 测试用户
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
async function runDbManagerTests(users) {
  if (users) {
    testUsers = users;
  }
  
  console.log('\n🗄️ 测试数据库管理扩展 API');
  console.log('=====================================');
  
  // ========== 新增记录 ==========
  
  await test('POST /api/admin/table/:name - 新增记录', async () => {
    const { response, data } = await superAdminRequest('POST', `/api/admin/table/${testData.testTableName}`, {
      prescriptionId: 'TEST_DB_MGR_' + Date.now(),
      status: '待审核',
      openid: testUsers.normalUser.openid,
      name: '数据库管理测试',
      age: '30',
      date: new Date().toISOString().split('T')[0],
      rp: '测试处方内容',
      dosage: '3',
      medicines: []
    });
    
    if (response.statusCode !== 200) {
      throw new Error(`状态码 ${response.statusCode}, 响应: ${JSON.stringify(data)}`);
    }
    assertEquals(data.code, 0, `返回成功 (实际: ${data.code})`);
    assert(data.data && data.data.id, `返回记录ID (data: ${JSON.stringify(data.data)})`);
    testData.testRecordId = data.data.id;
    console.log(`  记录ID: ${testData.testRecordId}`);
  });
  
  await test('POST /api/admin/table/:name - 验证新增记录存在', async () => {
    if (!testData.testRecordId) {
      console.log('  testRecordId 未设置，跳过验证');
      return 'skipped';
    }
    
    const { response, data } = await superAdminRequest('GET', `/api/admin/table/${testData.testTableName}`);
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    
    const record = data.data.rows.find(r => r.id === testData.testRecordId);
    assert(record, `新增记录存在 (ID: ${testData.testRecordId})`);
  });
  
  // ========== 更新记录 ==========
  
  await test('PUT /api/admin/table/:name/:id - 更新记录', async () => {
    if (!testData.testRecordId) {
      console.log('  testRecordId 未设置，跳过更新测试');
      return 'skipped';
    }
    
    console.log(`  更新记录 ID: ${testData.testRecordId}`);
    const { response, data } = await superAdminRequest('PUT', `/api/admin/table/${testData.testTableName}/${testData.testRecordId}`, {
      name: '数据库管理测试_已更新',
      age: '35'
    });
    
    if (response.statusCode !== 200) {
      throw new Error(`状态码 ${response.statusCode}, 响应: ${JSON.stringify(data)}`);
    }
    assertEquals(data.code, 0, `返回成功 (实际: ${data.code})`);
  });
  
  await test('PUT /api/admin/table/:name/:id - 验证更新结果', async () => {
    if (!testData.testRecordId) return 'skipped';
    
    // 直接通过 ID 获取记录验证更新结果
    const { response, data } = await superAdminRequest('GET', `/api/admin/table/${testData.testTableName}?pageSize=100`);
    
    assertEquals(response.statusCode, 200, '请求成功');
    
    const record = data.data.rows.find(r => r.id == testData.testRecordId);
    assert(record, `记录存在 (ID: ${testData.testRecordId})`);
    assertEquals(record.name, '数据库管理测试_已更新', `姓名已更新 (实际: ${record.name})`);
    assertEquals(record.age, '35', `年龄已更新 (实际: ${record.age})`);
  });
  
  // ========== 字段保护 ==========
  
  await test('PUT /api/admin/table/:name/:id - openid 不可修改', async () => {
    if (!testData.testRecordId) return 'skipped';
    
    // 尝试修改 openid（应该被忽略或拒绝）
    await superAdminRequest('PUT', `/api/admin/table/${testData.testTableName}/${testData.testRecordId}`, {
      openid: 'hacker_openid'
    });
    
    // 获取记录验证 openid 未被修改
    const checkResponse = await superAdminRequest('GET', `/api/admin/table/${testData.testTableName}`);
    const record = checkResponse.data.data.rows.find(r => r.id === testData.testRecordId);
    
    assertEquals(record.openid, testUsers.normalUser.openid, 'openid 未被修改');
  });
  
  await test('PUT /api/admin/table/:name/:id - createdAt 不可修改', async () => {
    if (!testData.testRecordId) return 'skipped';
    
    const originalResponse = await superAdminRequest('GET', `/api/admin/table/${testData.testTableName}`);
    const originalRecord = originalResponse.data.data.rows.find(r => r.id === testData.testRecordId);
    const originalCreatedAt = originalRecord.createdAt;
    
    // 尝试修改 createdAt
    await superAdminRequest('PUT', `/api/admin/table/${testData.testTableName}/${testData.testRecordId}`, {
      createdAt: '2000-01-01T00:00:00.000Z'
    });
    
    // 验证 createdAt 未被修改
    const checkResponse = await superAdminRequest('GET', `/api/admin/table/${testData.testTableName}`);
    const record = checkResponse.data.data.rows.find(r => r.id === testData.testRecordId);
    
    assertEquals(record.createdAt, originalCreatedAt, 'createdAt 未被修改');
  });
  
  // ========== 分页查询 ==========
  
  await test('GET /api/admin/table/:name - 分页参数验证', async () => {
    const { response, data } = await superAdminRequest('GET', `/api/admin/table/${testData.testTableName}?page=1&pageSize=5`);
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(data.data.pagination, '返回分页信息');
    assertEquals(data.data.pagination.page, 1, '页码正确');
    assertEquals(data.data.pagination.pageSize, 5, '每页数量正确');
    
    // 检查返回记录数
    const rowCount = data.data.rows.length;
    if (rowCount > 5) {
      throw new Error(`返回记录数 ${rowCount} 超过 pageSize 5`);
    }
    console.log(`  返回 ${rowCount} 条记录`);
  });
  
  await test('GET /api/admin/table/:name - 不存在的表返回错误', async () => {
    const { response, data } = await superAdminRequest('GET', '/api/admin/table/non_existent_table_xyz');
    
    assertEquals(response.statusCode, 404, '返回404');
  });
  
  // ========== 删除记录 ==========
  
  await test('DELETE /api/admin/table/:name/:id - 删除记录', async () => {
    if (!testData.testRecordId) return 'skipped';
    
    console.log(`  删除记录 ID: ${testData.testRecordId}`);
    const { response, data } = await superAdminRequest('DELETE', `/api/admin/table/${testData.testTableName}/${testData.testRecordId}`);
    
    if (response.statusCode !== 200) {
      throw new Error(`状态码 ${response.statusCode}, 响应: ${JSON.stringify(data)}`);
    }
    assertEquals(data.code, 0, `返回成功 (实际: ${data.code})`);
  });
  
  await test('DELETE /api/admin/table/:name/:id - 验证记录已删除', async () => {
    if (!testData.testRecordId) return 'skipped';
    
    const { response, data } = await superAdminRequest('GET', `/api/admin/table/${testData.testTableName}?pageSize=100`);
    
    const record = data.data.rows.find(r => r.id == testData.testRecordId);
    assert(!record, `记录已删除 (ID: ${testData.testRecordId})`);
  });
  
  await test('DELETE /api/admin/table/:name/:id - 删除不存在的记录', async () => {
    const { response, data } = await superAdminRequest('DELETE', `/api/admin/table/${testData.testTableName}/99999999`);
    
    // 应该返回 404
    assertEquals(response.statusCode, 404, `返回404 (实际: ${response.statusCode})`);
  });
  
  // ========== 权限验证 ==========
  
  await test('POST /api/admin/table/:name - 普通用户无权访问', async () => {
    const { response, data } = await request('POST', `/api/admin/table/${testData.testTableName}`, {
      prescriptionId: 'HACK_TEST',
      status: '待审核'
    }, {
      'x-openid': testUsers.normalUser.openid
    });
    
    assertEquals(response.statusCode, 403, '返回403禁止访问');
  });
  
  await test('PUT /api/admin/table/:name/:id - 管理员无权访问（仅超管）', async () => {
    const { response, data } = await request('PUT', `/api/admin/table/${testData.testTableName}/1`, {
      name: 'hacker'
    }, {
      'x-openid': testUsers.adminUser.openid
    });
    
    assertEquals(response.statusCode, 403, '返回403禁止访问');
  });
  
  // ========== 输出测试结果 ==========
  console.log('\n📊 数据库管理测试结果');
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
 * 清理测试数据
 */
async function cleanupTestData() {
  console.log('\n🧹 清理数据库管理测试数据...');
  
  try {
    // 确保测试记录被删除
    if (testData.testRecordId) {
      await superAdminRequest('DELETE', `/api/admin/table/${testData.testTableName}/${testData.testRecordId}`);
    }
    
    console.log('✅ 数据库管理测试数据清理完成');
  } catch (error) {
    console.log('⚠️  清理数据库管理测试数据失败:', error.message);
  }
}

// 导出模块
module.exports = {
  runDbManagerTests,
  cleanupTestData,
  getTestStats: () => testStats
};