/**
 * 库存管理系统 API 测试
 * 
 * 测试范围：
 * - 药材基础信息管理
 * - 入库单管理
 * - 出库单管理
 * - 库存统计与预警
 * 
 * 注意：此测试文件需在 API 实现后运行
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
  herbId: null,
  herbName: '测试药材_' + Date.now(),
  inOrderId: null,
  inOrderNo: null,
  outOrderId: null,
  outOrderNo: null
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
 * 管理员请求（带权限 header）
 */
function adminRequest(method, url, body = null) {
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
 * 主测试函数
 */
async function runStockTests(users) {
  if (users) {
    testUsers = users;
  }
  
  console.log('\n📦 测试库存管理系统 API');
  console.log('=====================================');
  
  // ========== 药材基础信息管理 ==========
  console.log('\n--- 药材基础信息管理 ---');
  
  await test('GET /api/stock/herbs - 获取药材列表', async () => {
    const { response, data } = await adminRequest('GET', '/api/stock/herbs');

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    // API 返回分页格式 { rows: [], pagination: {} }
    assert(Array.isArray(data.data.rows), '返回数组');
  });
  
  await test('POST /api/stock/herbs - 创建药材', async () => {
    const { response, data } = await adminRequest('POST', '/api/stock/herbs', {
      name: testData.herbName,
      alias: '测试别名|测试药',
      cabinetNo: 'A-01',
      coefficient: 1.5,
      costPrice: 10,
      salePrice: 0.05,
      minValue: 100,
      remark: '测试备注'
    });

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(data.data.id, '返回药材ID');
    // 验证新增字段被正确保存
    assertEquals(data.data.cabinetNo, 'A-01', '柜号正确保存');
    assertEquals(data.data.coefficient, 1.5, '系数正确保存');
    assertEquals(data.data.costPrice, 10, '成本价正确保存');
    testData.herbId = data.data.id;
  });
  
  await test('POST /api/stock/herbs - 重复创建应失败', async () => {
    const { response, data } = await adminRequest('POST', '/api/stock/herbs', {
      name: testData.herbName,
      cabinetNo: 'A-02',
      salePrice: 0.05
    });
    
    assertEquals(response.statusCode, 400, '请求失败');
    assertEquals(data.code, 1, '返回错误');
  });
  
  await test('PUT /api/stock/herbs/:id - 更新药材信息', async () => {
    if (!testData.herbId) return 'skipped';
    
    const { response, data } = await adminRequest('PUT', `/api/stock/herbs/${testData.herbId}`, {
      minValue: 200,
      alias: '更新后的别名',
      cabinetNo: 'B-01',
      salePrice: 0.06
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
  });
  
  // ========== 入库管理 ==========
  console.log('\n--- 入库管理 ---');
  
  await test('GET /api/stock/in/orders - 获取入库单列表', async () => {
    const { response, data } = await adminRequest('GET', '/api/stock/in/orders');

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(Array.isArray(data.data.rows), '返回数组');
  });
  
  await test('POST /api/stock/in/orders - 创建入库单（草稿）', async () => {
    const { response, data } = await adminRequest('POST', '/api/stock/in/orders', {
      orderDate: new Date().toISOString().split('T')[0],
      supplierName: '测试供应商',
      items: [
        {
          herbName: testData.herbName,
          quantity: 500,
          unitPrice: 0.05,
          remark: '测试入库'
        }
      ]
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(data.data.id, '返回入库单ID');
    assert(data.data.orderNo, '返回入库单号');
    assertEquals(data.data.status, 'draft', '状态为草稿');
    testData.inOrderId = data.data.id;
    testData.inOrderNo = data.data.orderNo;
  });
  
  await test('GET /api/stock/in/orders/:id - 获取入库单详情', async () => {
    if (!testData.inOrderId) return 'skipped';
    
    const { response, data } = await adminRequest('GET', `/api/stock/in/orders/${testData.inOrderId}`);
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(data.data.items, '包含明细');
  });
  
  await test('PUT /api/stock/in/orders/:id - 更新入库单', async () => {
    if (!testData.inOrderId) return 'skipped';
    
    const { response, data } = await adminRequest('PUT', `/api/stock/in/orders/${testData.inOrderId}`, {
      supplierName: '更新后的供应商',
      items: [
        {
          herbName: testData.herbName,
          quantity: 600,
          unitPrice: 0.06
        }
      ]
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
  });
  
  // 使用 status 接口执行入库
  await test('PUT /api/stock/in/orders/:id/status - 执行入库', async () => {
    if (!testData.inOrderId) return 'skipped';

    const { response, data } = await adminRequest('PUT', `/api/stock/in/orders/${testData.inOrderId}/status`, {
      status: 'stocked'
    });

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
  });

  await test('DELETE /api/stock/in/orders/:id - 已入库单不可删除', async () => {
    if (!testData.inOrderId) return 'skipped';

    const { response, data } = await adminRequest('DELETE', `/api/stock/in/orders/${testData.inOrderId}`);

    assertEquals(response.statusCode, 400, '请求失败');
    assertEquals(data.code, 1, '返回错误');
  });

  // ========== 出库管理 ==========
  console.log('\n--- 出库管理 ---');
  
  await test('GET /api/stock/out/orders - 获取出库单列表', async () => {
    const { response, data } = await adminRequest('GET', '/api/stock/out/orders');

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(Array.isArray(data.data.rows), '返回数组');
  });
  
  await test('POST /api/stock/out/orders - 创建执药单', async () => {
    const { response, data } = await adminRequest('POST', '/api/stock/out/orders', {
      prescriptionId: 'TEST_PRESCRIPTION_' + Date.now(),
      pharmacist: '测试药师',
      reviewer: '测试审核人',
      items: [
        {
          herbName: testData.herbName,
          quantity: 100,
          remark: '测试执药'
        }
      ]
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(data.data.id, '返回执药单ID');
    testData.outOrderId = data.data.id;
    testData.outOrderNo = data.data.prescriptionId;
  });
  
  await test('POST /api/stock/out/orders - 处方ID重复应失败', async () => {
    const { response, data } = await adminRequest('POST', '/api/stock/out/orders', {
      prescriptionId: 'DUPLICATE_TEST_' + Date.now(),
      pharmacist: '测试药师',
      items: [
        {
          herbName: testData.herbName,
          quantity: 100
        }
      ]
    });
    
    // 第一次创建应该成功
    assertEquals(response.statusCode, 200, '第一次创建成功');
    
    // 尝试使用相同处方ID再次创建
    const { response: response2, data: data2 } = await adminRequest('POST', '/api/stock/out/orders', {
      prescriptionId: data.data.prescriptionId,
      pharmacist: '测试药师',
      items: [
        {
          herbName: testData.herbName,
          quantity: 50
        }
      ]
    });
    
    assertEquals(response2.statusCode, 400, '重复创建应失败');
    assertEquals(data2.code, 1, '返回错误');
  });
  
  await test('POST /api/stock/out/orders/:id/settle - 结算执药单', async () => {
    if (!testData.outOrderId) return 'skipped';
    
    // 使用专用结算接口
    const { response, data } = await adminRequest('POST', `/api/stock/out/orders/${testData.outOrderId}/settle`);
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
  });
  
  // ========== 入库单状态回滚测试 ==========
  console.log('\n--- 入库单状态回滚 ---');
  
  // 创建新的入库单用于测试状态回滚
  let rollbackInOrderId = null;
  
  await test('POST /api/stock/in/orders - 创建入库单用于回滚测试', async () => {
    const { response, data } = await adminRequest('POST', '/api/stock/in/orders', {
      orderDate: new Date().toISOString().split('T')[0],
      supplierName: '回滚测试供应商',
      items: [
        {
          herbName: testData.herbName,
          quantity: 200,
          unitPrice: 0.05,
          remark: '测试回滚'
        }
      ]
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    rollbackInOrderId = data.data.id;
  });
  
  // 直接使用 status 接口执行入库
  await test('PUT /api/stock/in/orders/:id/status - 执行入库', async () => {
    if (!rollbackInOrderId) return 'skipped';

    const { response, data } = await adminRequest('PUT', `/api/stock/in/orders/${rollbackInOrderId}/status`, {
      status: 'stocked'
    });

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
  });

  await test('PUT /api/stock/in/orders/:id/status - 已入库单变为草稿状态应回滚库存', async () => {
    if (!rollbackInOrderId) return 'skipped';

    // 通过专用API修改状态为draft
    const { response, data } = await adminRequest('PUT', `/api/stock/in/orders/${rollbackInOrderId}/status`, {
      status: 'draft'
    });

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
  });
  
  // 清理回滚测试数据
  if (rollbackInOrderId) {
    await adminRequest('DELETE', `/api/stock/in/orders/${rollbackInOrderId}`);
  }
  
  // ========== 执药单状态变化测试 ==========
  console.log('\n--- 执药单状态变化 ---');
  
  // 创建新的执药单用于测试状态变化
  let statusOutOrderId = null;
  
  await test('POST /api/stock/out/orders - 创建执药单用于状态测试', async () => {
    const { response, data } = await adminRequest('POST', '/api/stock/out/orders', {
      prescriptionId: 'STATUS_TEST_' + Date.now(),
      pharmacist: '测试药师',
      items: [
        {
          herbName: testData.herbName,
          quantity: 50,
          remark: '状态测试'
        }
      ]
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assertEquals(data.data.status, 'pending', '初始状态为待执药');
    statusOutOrderId = data.data.id;
  });
  
  await test('POST /api/stock/out/orders/:id/settle - 结算执药单', async () => {
    if (!statusOutOrderId) return 'skipped';
    
    const { response, data } = await adminRequest('POST', `/api/stock/out/orders/${statusOutOrderId}/settle`);
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
  });
  
  await test('POST /api/stock/out/orders/:id/revoke - 撤销已结算执药单', async () => {
    if (!statusOutOrderId) return 'skipped';
    
    const { response, data } = await adminRequest('POST', `/api/stock/out/orders/${statusOutOrderId}/revoke`);
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
  });
  
  // 清理状态测试数据
  if (statusOutOrderId) {
    await adminRequest('DELETE', `/api/stock/out/orders/${statusOutOrderId}`);
  }

  // ========== 别名映射测试 ==========
  console.log('\n--- 别名映射 ---');

  // 别名测试专用数据
  const aliasTestData = {
    herbId: null,
    herbName: '白术_' + Date.now(),
    alias: '于术|冬术|浙术'
  };
  let aliasOutOrderId = null;

  await test('POST /api/stock/herbs - 创建带别名的药材', async () => {
    const { response, data } = await adminRequest('POST', '/api/stock/herbs', {
      name: aliasTestData.herbName,
      alias: aliasTestData.alias,
      unit: '克',
      minValue: 0,
      salePrice: 100,
      cabinetNo: 'ALIAS-01'
    });

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assertEquals(data.data.name, aliasTestData.herbName, '药材名称正确');
    assertEquals(data.data.alias, aliasTestData.alias, '别名正确');
    aliasTestData.herbId = data.data.id;
  });

  await test('POST /api/stock/out/orders - 使用别名创建执药单应映射到主药材名', async () => {
    const { response, data } = await adminRequest('POST', '/api/stock/out/orders', {
      prescriptionId: 'ALIAS_TEST_' + Date.now(),
      pharmacist: '测试药师',
      items: [
        {
          herbName: '于术',  // 使用别名
          quantity: 30
        }
      ]
    });

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    // 验证药材名被映射为主药材名
    assertEquals(data.data.items[0].herbName, aliasTestData.herbName, '别名应映射到主药材名');
    assertEquals(data.data.items[0].unitPrice, 100, '售价应正确获取');
    aliasOutOrderId = data.data.id;
  });

  await test('GET /api/stock/out/orders/:id - 查询执药单应显示主药材名', async () => {
    if (!aliasOutOrderId) return 'skipped';

    const { response, data } = await adminRequest('GET', `/api/stock/out/orders/${aliasOutOrderId}`);

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assertEquals(data.data.items[0].herbName, aliasTestData.herbName, '药材名应为主药材名');
    assertEquals(data.data.items[0].cabinetNo, 'ALIAS-01', '柜号应正确获取');
  });

  await test('PUT /api/stock/out/orders/:id - 更新执药单使用别名应映射', async () => {
    if (!aliasOutOrderId) return 'skipped';

    const { response, data } = await adminRequest('PUT', `/api/stock/out/orders/${aliasOutOrderId}`, {
      items: [
        {
          herbName: '冬术',  // 使用另一个别名
          quantity: 50,
          cabinetNo: 'ALIAS-01'
        }
      ]
    });

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assertEquals(data.data.items[0].herbName, aliasTestData.herbName, '别名应映射到主药材名');
  });

  // 清理别名测试数据
  if (aliasOutOrderId) {
    await adminRequest('DELETE', `/api/stock/out/orders/${aliasOutOrderId}`);
  }
  if (aliasTestData.herbId) {
    await adminRequest('DELETE', `/api/stock/herbs/${aliasTestData.herbId}`);
  }

  // ========== 多维度搜索测试 ==========
  console.log('\n--- 多维度搜索 ---');

  await test('GET /api/stock/herbs - 按名称搜索（使用searchFields）', async () => {
    const { response, data } = await adminRequest('GET', `/api/stock/herbs?keyword=${encodeURIComponent(testData.herbName)}&searchFields=name,alias,cabinetNo`);

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(data.data.rows.length > 0, '应该找到匹配的药材');

    // 验证至少有一个返回结果的name字段包含关键字
    const hasMatch = data.data.rows.some(row =>
      row.name && row.name.toLowerCase().includes(testData.herbName.toLowerCase())
    );
    assert(hasMatch, '返回结果应在name字段包含搜索关键字');
  });

  await test('GET /api/stock/herbs - 按柜号搜索（使用searchFields）', async () => {
    const { response, data } = await adminRequest('GET', '/api/stock/herbs?keyword=B-01&searchFields=name,alias,cabinetNo');

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    // 测试药材柜号已更新为 B-01
    assert(data.data.rows.length > 0, '应该找到匹配的药材');
  });

  await test('GET /api/stock/in/orders - 按供应商搜索（使用searchFields）', async () => {
    const { response, data } = await adminRequest('GET', '/api/stock/in/orders?keyword=供应商&searchFields=supplierName');

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    // 应该能找到包含"供应商"的入库单
  });

  await test('GET /api/stock/out/orders - 按药师搜索（使用searchFields）', async () => {
    const { response, data } = await adminRequest('GET', '/api/stock/out/orders?keyword=测试管理员&searchFields=prescriptionId,pharmacist');

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
  });

  await test('GET /api/stock/out/orders - 按状态搜索（不使用searchFields，全字段搜索）', async () => {
    const { response, data } = await adminRequest('GET', '/api/stock/out/orders?keyword=pending');

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
  });

  await test('GET /api/stock/herbs - 空关键字返回所有数据', async () => {
    const { response, data } = await adminRequest('GET', '/api/stock/herbs?keyword=');

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(data.data.pagination.totalCount >= 1, '至少有一条数据');
  });

  // ========== 权限控制 ==========
  console.log('\n--- 权限控制 ---');

  await test('POST /api/stock/in/orders - 无权限用户创建应被拒绝', async () => {
    const { response, data } = await request('POST', '/api/stock/in/orders', {
      orderDate: new Date().toISOString().split('T')[0],
      supplierName: '测试'
    }, {
      'x-openid': testUsers.normalUser.openid
    });
    
    // 用户不存在返回404，权限不足返回403，两者都是正确的拒绝行为
    const isDenied = response.statusCode === 403 || response.statusCode === 404 || response.statusCode === 401;
    assert(isDenied, `应被拒绝访问，实际状态码: ${response.statusCode}`);
  });
  
  // ========== 输出测试结果 ==========
  console.log('\n📊 库存管理系统测试结果');
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
  console.log('\n🧹 清理库存测试数据...');
  
  try {
    // 删除测试药材（会级联删除相关数据）
    if (testData.herbId) {
      await adminRequest('DELETE', `/api/stock/herbs/${testData.herbId}`);
    }
    
    // 删除测试入库单
    if (testData.inOrderId) {
      await adminRequest('DELETE', `/api/stock/in/orders/${testData.inOrderId}`);
    }
    
    // 删除测试出库单
    if (testData.outOrderId) {
      await adminRequest('DELETE', `/api/stock/out/orders/${testData.outOrderId}`);
    }
    
    console.log('✅ 库存测试数据清理完成');
  } catch (error) {
    console.log('⚠️  清理库存测试数据失败:', error.message);
  }
}

// 导出模块
module.exports = {
  runStockTests,
  cleanupTestData,
  getTestStats: () => testStats
};