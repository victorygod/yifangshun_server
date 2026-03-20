/**
 * 库存管理系统 API 测试
 * 
 * 测试范围：
 * - 药材基础信息管理
 * - 入库单管理
 * - 出库单管理
 * - 库存统计与预警
 * - 盘点管理
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
  outOrderNo: null,
  checkOrderId: null,
  checkOrderNo: null
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
    assert(Array.isArray(data.data), '返回数组');
  });
  
  await test('POST /api/stock/herbs - 创建药材', async () => {
    const { response, data } = await adminRequest('POST', '/api/stock/herbs', {
      name: testData.herbName,
      alias: '测试别名|测试药',
      cabinetNo: 'A-01',
      salePrice: 0.05,
      minValue: 100,
      remark: '测试备注'
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(data.data.id, '返回药材ID');
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
    assert(Array.isArray(data.data), '返回数组');
  });
  
  await test('POST /api/stock/in/orders - 创建入库单（草稿）', async () => {
    const { response, data } = await adminRequest('POST', '/api/stock/in/orders', {
      orderDate: new Date().toISOString().split('T')[0],
      supplierName: '测试供应商',
      supplierPhone: '13800138000',
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
  
  await test('POST /api/stock/in/orders/:id/confirm - 确认入库单', async () => {
    if (!testData.inOrderId) return 'skipped';
    
    const { response, data } = await adminRequest('POST', `/api/stock/in/orders/${testData.inOrderId}/confirm`);
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assertEquals(data.data.status, 'confirmed', '状态变为已确认');
  });
  
  await test('POST /api/stock/in/orders/:id/stock - 执行入库', async () => {
    if (!testData.inOrderId) return 'skipped';
    
    const { response, data } = await adminRequest('POST', `/api/stock/in/orders/${testData.inOrderId}/stock`);
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assertEquals(data.data.status, 'stocked', '状态变为已入库');
  });
  
  await test('DELETE /api/stock/in/orders/:id - 已入库单不可删除', async () => {
    if (!testData.inOrderId) return 'skipped';
    
    const { response, data } = await adminRequest('DELETE', `/api/stock/in/orders/${testData.inOrderId}`);
    
    assertEquals(response.statusCode, 400, '请求失败');
    assertEquals(data.code, 1, '返回错误');
  });
  
  // ========== 库存统计 ==========
  console.log('\n--- 库存统计 ---');
  
  await test('GET /api/stock/inventory - 获取库存列表', async () => {
    const { response, data } = await adminRequest('GET', '/api/stock/inventory');
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(Array.isArray(data.data), '返回数组');
  });
  
  await test('GET /api/stock/inventory - 验证入库后库存增加', async () => {
    const { response, data } = await adminRequest('GET', '/api/stock/inventory');
    
    const herb = data.data.find(h => h.herbName === testData.herbName);
    assert(herb, '找到测试药材');
    assertEquals(herb.quantity, 600, '库存数量为600');
    // 验证均价（加权平均：600克 * 0.06元/克 = 36元，均价 = 0.06）
    const avgPrice = parseFloat(herb.avgPrice);
    assert(Math.abs(avgPrice - 0.06) < 0.01, '均价约为0.06');
  });
  
  await test('PUT /api/stock/inventory/:herbName/min-value - 设置最低库存阈值', async () => {
    const { response, data } = await adminRequest('PUT', `/api/stock/inventory/${encodeURIComponent(testData.herbName)}/min-value`, {
      minValue: 500
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
  });
  
  await test('GET /api/stock/inventory/alert - 获取库存预警', async () => {
    const { response, data } = await adminRequest('GET', '/api/stock/inventory/alert');
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(Array.isArray(data.data), '返回数组');
    // 测试药材库存600，阈值500，不应在预警列表
    const herb = data.data.find(h => h.herbName === testData.herbName);
    assert(!herb, '测试药材不应在预警列表（库存充足）');
  });
  
  // ========== 出库管理 ==========
  console.log('\n--- 出库管理 ---');
  
  await test('GET /api/stock/out/orders - 获取出库单列表', async () => {
    const { response, data } = await adminRequest('GET', '/api/stock/out/orders');
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(Array.isArray(data.data), '返回数组');
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
  
  await test('GET /api/stock/inventory - 验证出库后库存减少', async () => {
    const { response, data } = await adminRequest('GET', '/api/stock/inventory');
    
    const herb = data.data.find(h => h.herbName === testData.herbName);
    assert(herb, '找到测试药材');
    assertEquals(herb.quantity, 500, '库存数量减少到500');
  });
  
  // ========== 盘点管理 ==========
  console.log('\n--- 盘点管理 ---');
  
  await test('GET /api/stock/check/orders - 获取盘点单列表', async () => {
    const { response, data } = await adminRequest('GET', '/api/stock/check/orders');
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(Array.isArray(data.data), '返回数组');
  });
  
  await test('POST /api/stock/check/orders - 创建盘点单', async () => {
    const { response, data } = await adminRequest('POST', '/api/stock/check/orders', {
      checkDate: new Date().toISOString().split('T')[0],
      checker: '测试盘点人',
      items: [
        {
          herbName: testData.herbName,
          actualQuantity: 480 // 假设实际盘点比系统少20
        }
      ]
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(data.data.id, '返回盘点单ID');
    assert(data.data.checkNo, '返回盘点单号');
    testData.checkOrderId = data.data.id;
    testData.checkOrderNo = data.data.checkNo;
  });
  
  await test('POST /api/stock/check/orders/:id/confirm - 确认盘点', async () => {
    if (!testData.checkOrderId) return 'skipped';
    
    const { response, data } = await adminRequest('POST', `/api/stock/check/orders/${testData.checkOrderId}/confirm`);
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
  });
  
  await test('GET /api/stock/inventory - 验证盘点后库存调整', async () => {
    const { response, data } = await adminRequest('GET', '/api/stock/inventory');
    
    const herb = data.data.find(h => h.herbName === testData.herbName);
    assert(herb, '找到测试药材');
    assertEquals(herb.quantity, 480, '库存调整为盘点数量480');
  });
  
  // ========== 入库单状态回滚测试 ==========
  console.log('\n--- 入库单状态回滚 ---');
  
  // 创建新的入库单用于测试状态回滚
  let rollbackInOrderId = null;
  
  await test('POST /api/stock/in/orders - 创建入库单用于回滚测试', async () => {
    const { response, data } = await adminRequest('POST', '/api/stock/in/orders', {
      orderDate: new Date().toISOString().split('T')[0],
      supplierName: '回滚测试供应商',
      supplierPhone: '13900139000',
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
  
  await test('POST /api/stock/in/orders/:id/confirm - 确认入库单', async () => {
    if (!rollbackInOrderId) return 'skipped';
    
    const { response, data } = await adminRequest('POST', `/api/stock/in/orders/${rollbackInOrderId}/confirm`);
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
  });
  
  await test('POST /api/stock/in/orders/:id/stock - 执行入库', async () => {
    if (!rollbackInOrderId) return 'skipped';
    
    const { response, data } = await adminRequest('POST', `/api/stock/in/orders/${rollbackInOrderId}/stock`);
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assertEquals(data.data.status, 'stocked', '状态变为已入库');
  });
  
  await test('GET /api/stock/inventory - 验证入库后库存增加', async () => {
    const { response, data } = await adminRequest('GET', '/api/stock/inventory');
    
    const herb = data.data.find(h => h.herbName === testData.herbName);
    assert(herb, '找到测试药材');
    // 原库存480 + 新入库200 = 680
    assertEquals(herb.quantity, 680, '库存数量应为680');
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
  
  await test('GET /api/stock/inventory - 创建执药单后库存不变', async () => {
    const { response, data } = await adminRequest('GET', '/api/stock/inventory');
    
    const herb = data.data.find(h => h.herbName === testData.herbName);
    assert(herb, '找到测试药材');
    // 待执药状态不应扣减库存
    assertEquals(herb.quantity, 480, '库存数量仍为480');
  });
  
  await test('POST /api/stock/out/orders/:id/settle - 结算执药单', async () => {
    if (!statusOutOrderId) return 'skipped';
    
    const { response, data } = await adminRequest('POST', `/api/stock/out/orders/${statusOutOrderId}/settle`);
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
  });
  
  await test('GET /api/stock/inventory - 验证已结算后库存扣减', async () => {
    const { response, data } = await adminRequest('GET', '/api/stock/inventory');
    
    const herb = data.data.find(h => h.herbName === testData.herbName);
    assert(herb, '找到测试药材');
    // 480 - 50 = 430
    assertEquals(herb.quantity, 430, '库存数量应为430');
  });
  
  await test('POST /api/stock/out/orders/:id/revoke - 撤销已结算执药单', async () => {
    if (!statusOutOrderId) return 'skipped';
    
    const { response, data } = await adminRequest('POST', `/api/stock/out/orders/${statusOutOrderId}/revoke`);
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
  });
  
  await test('GET /api/stock/inventory - 验证状态回滚后库存恢复', async () => {
    const { response, data } = await adminRequest('GET', '/api/stock/inventory');
    
    const herb = data.data.find(h => h.herbName === testData.herbName);
    assert(herb, '找到测试药材');
    // 430 + 50 = 480
    assertEquals(herb.quantity, 480, '库存数量应恢复为480');
  });
  
  // 清理状态测试数据
  if (statusOutOrderId) {
    await adminRequest('DELETE', `/api/stock/out/orders/${statusOutOrderId}`);
  }
  
  // ========== 多维度搜索测试 ==========
  console.log('\n--- 多维度搜索 ---');
  
  await test('GET /api/admin/table/herbs - 按名称搜索', async () => {
    const { response, data } = await adminRequest('GET', `/api/admin/table/herbs?keyword=${encodeURIComponent(testData.herbName)}`);
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(data.data.rows.length > 0, '应该找到匹配的药材');
    
    // 验证至少有一个返回结果包含关键字
    const hasAnyMatch = data.data.rows.some(row => {
      return Object.values(row).some(v => 
        v && String(v).toLowerCase().includes(testData.herbName.toLowerCase())
      );
    });
    assert(hasAnyMatch, '返回结果应包含搜索关键字');
  });
  
  await test('GET /api/admin/table/herbs - 按柜号搜索', async () => {
    const { response, data } = await adminRequest('GET', '/api/admin/table/herbs?keyword=B-01');
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    // 测试药材柜号已更新为 B-01
    assert(data.data.rows.length > 0, '应该找到匹配的药材');
  });
  
  await test('GET /api/admin/table/stock_in_orders - 按供应商搜索', async () => {
    const { response, data } = await adminRequest('GET', '/api/admin/table/stock_in_orders?keyword=供应商');
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    // 应该能找到包含"供应商"的入库单
  });
  
  await test('GET /api/admin/table/stock_out_orders - 按药师搜索', async () => {
    const { response, data } = await adminRequest('GET', '/api/admin/table/stock_out_orders?keyword=测试管理员');
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
  });
  
  await test('GET /api/admin/table/stock_out_orders - 按状态搜索', async () => {
    const { response, data } = await adminRequest('GET', '/api/admin/table/stock_out_orders?keyword=pending');
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
  });
  
  await test('GET /api/admin/table/herbs - 空关键字返回所有数据', async () => {
    const { response, data } = await adminRequest('GET', '/api/admin/table/herbs?keyword=');
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(data.data.pagination.totalCount >= 1, '至少有一条数据');
  });
  
  // ========== 权限控制 ==========
  console.log('\n--- 权限控制 ---');
  
  await test('GET /api/stock/inventory - 无权限用户访问应被拒绝', async () => {
    const { response, data } = await request('GET', '/api/stock/inventory', null, {
      'x-openid': testUsers.normalUser.openid
    });
    
    // 用户不存在返回404，权限不足返回403，两者都是正确的拒绝行为
    const isDenied = response.statusCode === 403 || response.statusCode === 404 || response.statusCode === 401;
    assert(isDenied, `应被拒绝访问，实际状态码: ${response.statusCode}`);
  });
  
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
    
    // 删除测试盘点单
    if (testData.checkOrderId) {
      await adminRequest('DELETE', `/api/stock/check/orders/${testData.checkOrderId}`);
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