/**
 * 通用只读API测试 - 验证替代 admin/table API 的可行性
 *
 * 测试目标：验证 /api/readonly/:table 能否完成与 admin/table API 相同的功能
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
  herbName: '测试只读API_' + Date.now(),
  inOrderId: null,
  outOrderId: null
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
 * 准备测试数据
 */
async function prepareTestData() {
  console.log('\n📋 准备测试数据...');

  // 创建测试药材
  const herbRes = await adminRequest('POST', '/api/stock/herbs', {
    name: testData.herbName,
    cabinetNo: 'A-READONLY-01',
    salePrice: 0.15
  });
  testData.herbId = herbRes.data?.id;
  console.log(`  创建药材: ${testData.herbName} (ID: ${testData.herbId})`);

  // 创建入库单（会产生入库明细和库存日志）
  const inOrderRes = await adminRequest('POST', '/api/stock/in/orders', {
    orderDate: new Date().toISOString().split('T')[0],
    supplierName: '只读API测试供应商',
    items: [
      {
        herbName: testData.herbName,
        quantity: 100,
        unitPrice: 0.10
      }
    ]
  });
  testData.inOrderId = inOrderRes.data?.id;
  console.log(`  创建入库单: ID ${testData.inOrderId}`);

  // 创建执药单（会产生执药明细和库存日志）
  const outOrderRes = await adminRequest('POST', '/api/stock/out/orders', {
    pharmacist: '只读API测试药师',
    items: [
      {
        herbName: testData.herbName,
        quantity: 30
      }
    ]
  });
  testData.outOrderId = outOrderRes.data?.id;
  console.log(`  创建执药单: ID ${testData.outOrderId}`);

  console.log('✅ 测试数据准备完成');
}

/**
 * 清理测试数据
 */
async function cleanupTestData() {
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
}

/**
 * 主测试函数
 */
async function runReadonlyApiTests() {
  console.log('\n📊 测试通用只读API /api/readonly/:table');
  console.log('=====================================');

  // 准备测试数据
  await prepareTestData();

  // ==================== 1. 基础功能测试 ====================
  console.log('\n--- 基础功能测试 ---');

  await test('GET /api/readonly/:table - 不在白名单的表返回错误', async () => {
    const { response, data } = await adminRequest('GET', '/api/readonly/users');

    assertEquals(response.statusCode, 404, '应返回404');
    assertEquals(data.code, 1, '返回错误');
    assert(data.message.includes('不存在') || data.message.includes('不可访问'), '错误信息正确');
  });

  await test('GET /api/readonly/:table - 无权限返回401/403', async () => {
    const { response } = await request('GET', '/api/readonly/stock_logs', null, {
      'x-phone': 'test_normal_user'
    });

    assert(response.statusCode === 401 || response.statusCode === 403, '应返回401或403');
  });

  // ==================== 2. stock_in_items 测试 ====================
  console.log('\n--- stock_in_items 测试 ---');

  await test('GET /api/readonly/stock_in_items - 分页查询', async () => {
    const { response, data } = await adminRequest('GET', '/api/readonly/stock_in_items?page=1&pageSize=10');

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(Array.isArray(data.data?.rows), '返回 rows 数组');
    assert(data.data?.pagination !== undefined, '包含分页信息');
    assert(data.data.pagination.page === 1, '页码正确');
    assert(data.data.pagination.pageSize === 10, '每页数量正确');
  });

  await test('GET /api/readonly/stock_in_items - 关键词搜索', async () => {
    const { response, data } = await adminRequest('GET', `/api/readonly/stock_in_items?keyword=${encodeURIComponent(testData.herbName)}`);

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(Array.isArray(data.data?.rows), '返回数组');
    // 应该能找到我们创建的测试数据
    if (data.data.rows.length > 0) {
      const found = data.data.rows.some(item => item.herbName === testData.herbName);
      assert(found, `应该找到药材 ${testData.herbName}`);
    }
  });

  // ==================== 3. stock_out_items 测试 ====================
  console.log('\n--- stock_out_items 测试 ---');

  await test('GET /api/readonly/stock_out_items - 分页查询', async () => {
    const { response, data } = await adminRequest('GET', '/api/readonly/stock_out_items?page=1&pageSize=10');

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(Array.isArray(data.data?.rows), '返回 rows 数组');
    assert(data.data?.pagination !== undefined, '包含分页信息');
  });

  await test('GET /api/readonly/stock_out_items - 返回字段包含cabinetNo（关联药材表）', async () => {
    const { response, data } = await adminRequest('GET', `/api/readonly/stock_out_items?keyword=${encodeURIComponent(testData.herbName)}`);

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');

    // 检查返回的明细是否包含cabinetNo字段
    if (data.data.rows.length > 0) {
      const item = data.data.rows.find(i => i.herbName === testData.herbName);
      if (item) {
        assert(item.cabinetNo !== undefined, '包含cabinetNo字段');
        assertEquals(item.cabinetNo, 'A-READONLY-01', 'cabinetNo应该是药材的柜号');
      }
    }
  });

  await test('GET /api/readonly/stock_out_items - herbName不存在时cabinetNo为空', async () => {
    const { response, data } = await adminRequest('GET', '/api/readonly/stock_out_items');

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');

    // 检查所有明细都有cabinetNo字段（可能为空字符串）
    data.data.rows.forEach(item => {
      assert(item.cabinetNo !== undefined, '每条记录都有cabinetNo字段');
    });
  });

  // ==================== 4. stock_logs 测试 ====================
  console.log('\n--- stock_logs 测试 ---');

  await test('GET /api/readonly/stock_logs - 分页查询', async () => {
    const { response, data } = await adminRequest('GET', '/api/readonly/stock_logs?page=1&pageSize=10');

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(Array.isArray(data.data?.rows), '返回 rows 数组');
    assert(data.data?.pagination !== undefined, '包含分页信息');
  });

  await test('GET /api/readonly/stock_logs - 关键词搜索herbName', async () => {
    const { response, data } = await adminRequest('GET', `/api/readonly/stock_logs?keyword=${encodeURIComponent(testData.herbName)}`);

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(data.data?.pagination !== undefined, '包含分页信息');
    // 应该能找到我们创建的测试数据产生的日志
    if (data.data.rows.length > 0) {
      const found = data.data.rows.some(log => log.herbName === testData.herbName);
      assert(found, `应该找到药材 ${testData.herbName} 的日志`);
    }
  });

  // ==================== 5. 对比测试：readonly API vs admin/table API ====================
  console.log('\n--- 对比测试 ---');

  await test('对比：stock_in_items 返回格式一致', async () => {
    const readonlyResult = await adminRequest('GET', '/api/readonly/stock_in_items?page=1&pageSize=5');
    const tableResult = await adminRequest('GET', '/api/admin/table/stock_in_items?page=1&pageSize=5');

    // 两者返回格式应该一致
    assert(
      readonlyResult.data?.data?.rows !== undefined && tableResult.data?.data?.rows !== undefined,
      '两者都应返回 { rows, pagination } 格式'
    );
    assert(
      readonlyResult.data?.data?.pagination !== undefined && tableResult.data?.data?.pagination !== undefined,
      '两者都应包含分页信息'
    );
  });

  await test('对比：stock_out_items 返回格式一致', async () => {
    const readonlyResult = await adminRequest('GET', '/api/readonly/stock_out_items?page=1&pageSize=5');
    const tableResult = await adminRequest('GET', '/api/admin/table/stock_out_items?page=1&pageSize=5');

    // 两者返回格式应该一致
    assert(
      readonlyResult.data?.data?.rows !== undefined && tableResult.data?.data?.rows !== undefined,
      '两者都应返回 { rows, pagination } 格式'
    );

    // 检查cabinetNo字段都存在
    if (readonlyResult.data.data.rows.length > 0) {
      assert(readonlyResult.data.data.rows[0].cabinetNo !== undefined, 'readonly API返回cabinetNo');
    }
    if (tableResult.data.data.rows.length > 0) {
      assert(tableResult.data.data.rows[0].cabinetNo !== undefined, 'admin/table API返回cabinetNo');
    }
  });

  await test('对比：stock_logs 返回格式一致', async () => {
    const readonlyResult = await adminRequest('GET', '/api/readonly/stock_logs?page=1&pageSize=5');
    const tableResult = await adminRequest('GET', '/api/admin/table/stock_logs?page=1&pageSize=5');

    // 两者返回格式应该一致
    assert(
      readonlyResult.data?.data?.rows !== undefined && tableResult.data?.data?.rows !== undefined,
      '两者都应返回 { rows, pagination } 格式'
    );
  });

  // 清理测试数据
  await cleanupTestData();

  // 输出测试结果
  console.log('\n📊 通用只读API测试结果');
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
  runReadonlyApiTests,
  getTestStats: () => testStats
};