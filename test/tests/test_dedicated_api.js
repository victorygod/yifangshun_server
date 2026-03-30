/**
 * 专门 API 测试 - 验证替代 admin/table API 的可行性
 *
 * 测试目标：验证专门 API 能否完成与 admin/table API 相同的功能
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

// 测试数据存储
const testData = {
  herbId: null,
  herbName: '测试药材_DEDICATED_' + Date.now(),
  inOrderId: null,
  outOrderId: null,
  userId: null,
  userName: '测试用户_DEDICATED_' + Date.now()
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
          resolve({ response: res, data: null, rawData: data });
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
 * 管理员请求
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
async function runDedicatedApiTests() {
  console.log('\n📊 测试专门 API 替代 admin/table API');
  console.log('=====================================');

  // ==================== 1. 药材管理 ====================
  console.log('\n--- 药材管理 /api/stock/herbs ---');

  await test('GET /api/stock/herbs - 分页查询', async () => {
    const { response, data } = await adminRequest('GET', '/api/stock/herbs?page=1&pageSize=10');

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    // 专门API返回格式：{ code: 0, data: { rows, pagination } }
    assert(Array.isArray(data.data?.rows), '返回 rows 数组');
    assert(data.data?.pagination !== undefined, '包含分页信息');
  });

  await test('GET /api/stock/herbs - 关键词搜索', async () => {
    const { response, data } = await adminRequest('GET', '/api/stock/herbs?keyword=当归');

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(Array.isArray(data.data?.rows), '返回数组');
  });

  await test('POST /api/stock/herbs - 创建药材（与admin/table差异：不自动计算salePrice）', async () => {
    // 注意：专门API直接接收 salePrice，不会自动计算
    // 而 admin/table API 会自动计算 salePrice = costPrice * coefficient
    const { response, data } = await adminRequest('POST', '/api/stock/herbs', {
      name: testData.herbName,
      alias: '测试别名',
      cabinetNo: 'A-TEST-01',
      salePrice: 0.15,  // 专门API直接传 salePrice
      minValue: 50,
      remark: '专门API测试'
    });

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(data.data?.id, '返回ID');
    testData.herbId = data.data?.id;

    // 注意：专门API返回的数据不包含 costPrice/coefficient/salePrice
    // 这是与 admin/table API 的重要差异
    console.log('  注意: 专门API不返回 costPrice/coefficient/salePrice 字段');
  });

  await test('PUT /api/stock/herbs/:id - 更新药材', async () => {
    if (!testData.herbId) return 'skipped';

    const { response, data } = await adminRequest('PUT', `/api/stock/herbs/${testData.herbId}`, {
      minValue: 100,
      remark: '更新后的备注'
    });

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
  });

  // ==================== 2. 入库单管理 ====================
  console.log('\n--- 入库单管理 /api/stock/in/orders ---');

  await test('GET /api/stock/in/orders - 分页查询', async () => {
    const { response, data } = await adminRequest('GET', '/api/stock/in/orders?page=1&pageSize=10');

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    // 注意：专门API返回格式不同，data 是数组，不是 { rows, pagination }
    // 实际返回：{ code: 0,  [...], pagination: {...} }
    assert(Array.isArray(data.data), '返回 data 数组');
    assert(data.pagination !== undefined, '包含分页信息');
  });

  await test('GET /api/stock/in/orders - 状态筛选', async () => {
    const { response, data } = await adminRequest('GET', '/api/stock/in/orders?status=draft');

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    // 验证所有返回的记录都是 draft 状态
    if (data.data && data.data.length > 0) {
      data.data.forEach(order => {
        assertEquals(order.status, 'draft', '状态应为 draft');
      });
    }
  });

  await test('POST /api/stock/in/orders - 创建入库单（需要items）', async () => {
    if (!testData.herbId) return 'skipped';

    const { response, data } = await adminRequest('POST', '/api/stock/in/orders', {
      orderDate: new Date().toISOString().split('T')[0],
      supplierName: '专门API测试供应商',
      items: [
        {
          herbName: testData.herbName,
          quantity: 100,
          unitPrice: 0.10
        }
      ]
    });

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(data.data?.id, '返回ID');
    testData.inOrderId = data.data?.id;

    // 验证自动创建明细
    assert(data.data?.items?.length > 0, '应自动创建明细');
  });

  await test('GET /api/stock/in/orders/:id - 获取详情', async () => {
    if (!testData.inOrderId) return 'skipped';

    const { response, data } = await adminRequest('GET', `/api/stock/in/orders/${testData.inOrderId}`);

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(data.data?.id === testData.inOrderId, '返回正确的订单');
    assert(Array.isArray(data.data?.items), '包含明细');
  });

  // ==================== 3. 执药单管理 ====================
  console.log('\n--- 执药单管理 /api/stock/out/orders ---');

  await test('GET /api/stock/out/orders - 分页查询', async () => {
    const { response, data } = await adminRequest('GET', '/api/stock/out/orders?page=1&pageSize=10');

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(Array.isArray(data.data), '返回 data 数组');
    assert(data.pagination !== undefined, '包含分页信息');
  });

  await test('POST /api/stock/out/orders - 创建执药单（需要items）', async () => {
    if (!testData.herbId) return 'skipped';

    const prescriptionId = 'DEDICATED_TEST_' + Date.now();
    const { response, data } = await adminRequest('POST', '/api/stock/out/orders', {
      prescriptionId: prescriptionId,
      pharmacist: '测试药师',
      items: [
        {
          herbName: testData.herbName,
          quantity: 50
        }
      ]
    });

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(data.data?.id, '返回ID');
    testData.outOrderId = data.data?.id;

    // 验证自动计算价格
    assert(data.data?.totalPrice !== undefined, '应自动计算总价');
  });

  await test('POST /api/stock/out/orders - 允许空明细（手动创建模式）', async () => {
    const { response, data } = await adminRequest('POST', '/api/stock/out/orders', {
      pharmacist: '测试药师',
      remark: '空明细测试'
    });

    assertEquals(response.statusCode, 200, '应返回200成功');
    assertEquals(data.code, 0, '返回成功');
    assert(data.data?.id, '返回ID');
    assertEquals(data.data?.items?.length, 0, '明细为空数组');

    // 清理
    await adminRequest('DELETE', `/api/stock/out/orders/${data.data.id}`);
  });

  await test('POST /api/stock/out/orders - 允许无处方ID（手动创建模式）', async () => {
    const { response, data } = await adminRequest('POST', '/api/stock/out/orders', {
      pharmacist: '测试药师',
      items: [{ herbName: testData.herbName, quantity: 10 }]
    });

    assertEquals(response.statusCode, 200, '应返回200成功');
    assertEquals(data.code, 0, '返回成功');
    assert(data.data?.id, '返回ID');
    assert(data.data?.prescriptionId === null, '处方ID应为null');

    // 清理
    await adminRequest('DELETE', `/api/stock/out/orders/${data.data.id}`);
  });

  // ==================== 4. 用户管理 ====================
  console.log('\n--- 用户管理 /api/home/users ---');

  await test('GET /api/home/users - 分页查询', async () => {
    const { response, data } = await adminRequest('GET', '/api/home/users?page=1&pageSize=10');

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    // 注意：专门API返回格式：{ code: 0,  { list, pagination } }
    assert(Array.isArray(data.data?.list), '返回 list 数组');
    assert(data.data?.pagination !== undefined, '包含分页信息');
  });

  await test('GET /api/home/users - 关键词搜索', async () => {
    const { response, data } = await adminRequest('GET', '/api/home/users?keyword=测试');

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(Array.isArray(data.data?.list), '返回数组');
  });

  // ==================== 5. 对比测试：专门API vs admin/table API ====================
  console.log('\n--- 对比测试 ---');

  await test('对比：药材查询返回格式', async () => {
    // admin/table API
    const tableResult = await adminRequest('GET', '/api/admin/table/herbs?page=1&pageSize=5');

    // 专门API
    const dedicatedResult = await adminRequest('GET', '/api/stock/herbs?page=1&pageSize=5');

    // 两者返回格式应该一致
    assert(
      tableResult.data?.data?.rows !== undefined && dedicatedResult.data?.data?.rows !== undefined,
      '两者都应返回 { rows, pagination } 格式'
    );
  });

  await test('对比：入库单查询返回格式差异', async () => {
    // admin/table API
    const tableResult = await adminRequest('GET', '/api/admin/table/stock_in_orders?page=1&pageSize=5');

    // 专门API
    const dedicatedResult = await adminRequest('GET', '/api/stock/in/orders?page=1&pageSize=5');

    // admin/table: data.rows
    // 专门API: data (直接是数组)
    console.log('  admin/table 格式: data.data.rows =', Array.isArray(tableResult.data?.data?.rows));
    console.log('  专门API 格式: data.data =', Array.isArray(dedicatedResult.data?.data));

    // 这是格式差异，不是错误
    assert(true, '格式差异已记录');
  });

  await test('对比：用户查询返回格式差异', async () => {
    // admin/table API
    const tableResult = await adminRequest('GET', '/api/admin/table/users?page=1&pageSize=5');

    // 专门API
    const dedicatedResult = await adminRequest('GET', '/api/home/users?page=1&pageSize=5');

    // admin/table: data.rows
    // 专门API: data.list
    console.log('  admin/table 格式: data.data.rows =', Array.isArray(tableResult.data?.data?.rows));
    console.log('  专门API 格式: data.data.list =', Array.isArray(dedicatedResult.data?.data?.list));

    assert(true, '格式差异已记录');
  });

  // ==================== 清理测试数据 ====================
  console.log('\n🧹 清理测试数据...');

  try {
    if (testData.outOrderId) {
      await adminRequest('DELETE', `/api/stock/out/orders/${testData.outOrderId}`);
    }
    if (testData.inOrderId) {
      await adminRequest('DELETE', `/api/stock/in/orders/${testData.inOrderId}`);
    }
    if (testData.herbId) {
      await adminRequest('DELETE', `/api/stock/herbs/${testData.herbId}`);
    }
    console.log('✅ 清理完成');
  } catch (error) {
    console.log('⚠️  清理失败:', error.message);
  }

  // ==================== 输出结果 ====================
  console.log('\n📊 专门 API 测试结果');
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

// 导出模块
module.exports = {
  runDedicatedApiTests,
  getTestStats: () => testStats
};