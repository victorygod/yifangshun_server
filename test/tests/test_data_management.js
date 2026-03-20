/**
 * 数据表管理改造测试
 * 
 * 测试范围：
 * 1. 入库单/执药单级联删除
 * 2. 预约状态（待签到/已签到）
 * 3. 处方状态（待审核/已审核/已结算）
 * 4. 处方-执药单关联
 * 5. 本地数据库 Op.or 支持
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
  // 入库单测试数据
  inOrderId: null,
  inOrderItemIds: [],
  // 执药单测试数据
  outOrderId: null,
  outOrderItemIds: [],
  prescriptionId: null,
  // 预约测试数据
  bookingId: null
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

// ==================== 测试用例 ====================

/**
 * 1. 入库单/执药单级联删除测试
 */
async function testCascadeDelete() {
  console.log('\n--- 级联删除测试 ---');
  
  // 1.1 创建药材
  await test('创建测试药材', async () => {
    const res = await superAdminRequest('POST', '/api/stock/herbs', {
      name: '级联删除测试药材_' + Date.now(),
      alias: '测试别名',
      unit: '克',
      minValue: 0
    });
    assert(res.data.code === 0, '创建药材失败');
  });
  
  // 1.2 创建入库单
  await test('创建入库单', async () => {
    const res = await superAdminRequest('POST', '/api/stock/in/orders', {
      orderDate: new Date().toISOString().split('T')[0],
      supplier: '测试供应商',
      phone: '13800138000',
      status: 'draft'
    });
    assert(res.data.code === 0, '创建入库单失败');
    testData.inOrderId = res.data.data.id;
  });
  
  // 1.3 创建入库明细
  await test('创建入库明细', async () => {
    const res1 = await superAdminRequest('POST', '/api/admin/table/stock_in_items', {
      orderId: testData.inOrderId,
      herbName: '级联删除测试药材',
      quantity: 100,
      unitPrice: 10,
      totalPrice: 1000
    });
    assert(res1.data.code === 0, '创建入库明细1失败');
    testData.inOrderItemIds.push(res1.data.data.id);
    
    const res2 = await superAdminRequest('POST', '/api/admin/table/stock_in_items', {
      orderId: testData.inOrderId,
      herbName: '级联删除测试药材2',
      quantity: 50,
      unitPrice: 20,
      totalPrice: 1000
    });
    assert(res2.data.code === 0, '创建入库明细2失败');
    testData.inOrderItemIds.push(res2.data.data.id);
  });
  
  // 1.4 验证明细存在
  await test('验证明细已创建', async () => {
    const res = await superAdminRequest('GET', `/api/admin/table/stock_in_items?pageSize=100`);
    const items = res.data.data.rows.filter(item => item.orderId === testData.inOrderId);
    assertEquals(items.length, 2, '明细数量应为2');
  });
  
  // 1.5 删除入库单
  await test('删除入库单', async () => {
    const res = await superAdminRequest('DELETE', `/api/admin/table/stock_in_orders/${testData.inOrderId}`);
    assert(res.data.code === 0, '删除入库单失败');
  });
  
  // 1.6 验证明细已级联删除
  await test('验证明细已级联删除', async () => {
    const res = await superAdminRequest('GET', `/api/admin/table/stock_in_items?pageSize=100`);
    const items = res.data.data.rows.filter(item => testData.inOrderItemIds.includes(item.id));
    assertEquals(items.length, 0, '明细应已被级联删除');
  });
}

/**
 * 2. 预约状态测试
 */
async function testBookingStatus() {
  console.log('\n--- 预约状态测试 ---');
  
  // 2.1 创建预约
  await test('创建预约', async () => {
    // 预约明天
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    
    const res = await request('POST', '/api/booking', {
      date: dateStr,
      openid: testUsers.normalUser.openid
    });
    assert(res.data.code === 0, '创建预约失败');
    testData.bookingId = res.data.data.id;
    assertEquals(res.data.data.status, 'confirmed', '初始状态应为confirmed(待签到)');
  });
  
  // 2.2 验证初始状态
  await test('验证初始状态为待签到', async () => {
    const res = await superAdminRequest('GET', `/api/admin/table/bookings?pageSize=100`);
    const booking = res.data.data.rows.find(b => b.id === testData.bookingId);
    assert(booking, '未找到预约记录');
    assertEquals(booking.status, 'confirmed', '状态应为confirmed');
  });
  
  // 2.3 更新状态为已签到
  await test('更新状态为已签到', async () => {
    const res = await superAdminRequest('PUT', `/api/admin/table/bookings/${testData.bookingId}`, {
      status: 'checked_in'
    });
    assert(res.data.code === 0, '更新状态失败');
  });
  
  // 2.4 验证状态已更新
  await test('验证状态已更新为已签到', async () => {
    const res = await superAdminRequest('GET', `/api/admin/table/bookings?pageSize=100`);
    const booking = res.data.data.rows.find(b => b.id === testData.bookingId);
    assert(booking, '未找到预约记录');
    assertEquals(booking.status, 'checked_in', '状态应为checked_in(已签到)');
  });
  
  // 2.5 取消预约（直接删除）
  await test('取消预约（删除记录）', async () => {
    const res = await request('DELETE', `/api/booking/${testData.bookingId}?openid=${testUsers.normalUser.openid}`);
    assert(res.data.code === 0, '取消预约失败');
  });
  
  // 2.6 验证记录已删除
  await test('验证预约记录已删除', async () => {
    const res = await superAdminRequest('GET', `/api/admin/table/bookings?pageSize=100`);
    const booking = res.data.data.rows.find(b => b.id === testData.bookingId);
    assert(!booking, '预约记录应已删除');
  });
}

/**
 * 3. 处方状态测试
 */
async function testPrescriptionStatus() {
  console.log('\n--- 处方状态测试 ---');
  
  // 3.1 创建处方（待审核）
  await test('创建处方（待审核）', async () => {
    const res = await superAdminRequest('POST', '/api/admin/table/prescriptions', {
      prescriptionId: 'TEST_RX_' + Date.now(),
      openid: null, // openid可为空
      status: '待审核',
      data: JSON.stringify({
        name: '测试患者',
        age: '30',
        medicines: [
          { name: '黄芪', quantity: '10' },
          { name: '当归', quantity: '15' }
        ]
      })
    });
    assert(res.data.code === 0, '创建处方失败');
    testData.prescriptionId = res.data.data.prescriptionId;
  });
  
  // 3.2 验证openid为空
  await test('验证openid可为空', async () => {
    const res = await superAdminRequest('GET', `/api/admin/table/prescriptions?pageSize=100`);
    const prescription = res.data.data.rows.find(p => p.prescriptionId === testData.prescriptionId);
    assert(prescription, '未找到处方记录');
    // 注意：openid可能为null或undefined，都算通过
    assert(prescription.openid === null || prescription.openid === undefined || prescription.openid === '', 'openid应为空');
  });
  
  // 3.3 审核处方（待审核→已审核）
  await test('审核处方（待审核→已审核）', async () => {
    // 先获取处方记录
    const listRes = await superAdminRequest('GET', `/api/admin/table/prescriptions?pageSize=100`);
    const prescription = listRes.data.data.rows.find(p => p.prescriptionId === testData.prescriptionId);
    assert(prescription, '未找到处方记录');
    
    // 调用审核接口
    const res = await request('POST', '/api/prescription/review', {
      prescriptionId: testData.prescriptionId,
      status: '待审核',
      action: 'approve',
      reviewerName: '测试管理员',
      openid: testUsers.adminUser.openid
    }, { 'x-home-page': 'true' });
    
    assert(res.data.code === 0 || res.data.code === 2, '审核处方失败: ' + JSON.stringify(res.data));
    
    // 如果返回code=2，需要确认覆盖
    if (res.data.code === 2) {
      const confirmRes = await request('POST', '/api/prescription/confirm-approve', {
        prescriptionId: testData.prescriptionId,
        status: '待审核',
        reviewerName: '测试管理员',
        openid: testUsers.adminUser.openid
      }, { 'x-home-page': 'true' });
      assert(confirmRes.data.code === 0, '确认审核失败');
    }
  });
  
  // 3.4 验证处方状态为已审核
  await test('验证处方状态为已审核', async () => {
    const res = await superAdminRequest('GET', `/api/admin/table/prescriptions?pageSize=100`);
    const prescription = res.data.data.rows.find(p => p.prescriptionId === testData.prescriptionId && p.status === '已审核');
    assert(prescription, '未找到已审核的处方记录');
    assertEquals(prescription.status, '已审核', '状态应为已审核');
  });
  
  // 3.5 验证已审核处方创建了执药单
  await test('验证已审核处方创建了执药单', async () => {
    const res = await superAdminRequest('GET', `/api/admin/table/stock_out_orders?pageSize=100`);
    const order = res.data.data.rows.find(o => o.prescriptionId === testData.prescriptionId);
    assert(order, '应自动创建执药单');
    testData.outOrderId = order.id;
  });
}

/**
 * 4. 执药单结算测试
 */
async function testOutOrderSettle() {
  console.log('\n--- 执药单结算测试 ---');
  
  // 如果没有执药单，先创建一个
  if (!testData.outOrderId) {
    await test('创建测试执药单', async () => {
      const res = await superAdminRequest('POST', '/api/stock/out/orders', {
        prescriptionId: 'SETTLE_TEST_' + Date.now(),
        items: [
          { herbName: '黄芪', quantity: 10 },
          { herbName: '当归', quantity: 15 }
        ],
        operator: '测试管理员'
      });
      assert(res.data.code === 0, '创建执药单失败');
      testData.outOrderId = res.data.data.id;
      testData.prescriptionId = res.data.data.prescriptionId;
    });
  }
  
  // 4.1 验证执药单初始状态
  await test('验证执药单初始状态为pending', async () => {
    const res = await superAdminRequest('GET', `/api/admin/table/stock_out_orders/${testData.outOrderId}`);
    assertEquals(res.data.data.status, 'pending', '执药单状态应为pending');
  });
  
  // 4.2 结算执药单
  await test('结算执药单', async () => {
    const res = await superAdminRequest('PUT', `/api/admin/table/stock_out_orders/${testData.outOrderId}`, {
      status: 'settled'
    });
    assert(res.data.code === 0, '结算执药单失败');
  });
  
  // 4.3 验证执药单状态为已结算
  await test('验证执药单状态为已结算', async () => {
    const res = await superAdminRequest('GET', `/api/admin/table/stock_out_orders/${testData.outOrderId}`);
    assertEquals(res.data.data.status, 'settled', '执药单状态应为settled');
  });
  
  // 4.4 验证处方状态变为已结算
  await test('验证处方状态变为已结算', async () => {
    if (!testData.prescriptionId) {
      return 'skipped';
    }
    const res = await superAdminRequest('GET', `/api/admin/table/prescriptions?pageSize=100`);
    const prescription = res.data.data.rows.find(p => p.prescriptionId === testData.prescriptionId && p.status === '已结算');
    assert(prescription, '处方状态应变为已结算');
    assertEquals(prescription.status, '已结算', '处方状态应为已结算');
  });
  
  // 4.5 验证已结算处方不可编辑
  await test('验证已结算处方不可编辑', async () => {
    if (!testData.prescriptionId) {
      return 'skipped';
    }
    const listRes = await superAdminRequest('GET', `/api/admin/table/prescriptions?pageSize=100`);
    const prescription = listRes.data.data.rows.find(p => p.prescriptionId === testData.prescriptionId && p.status === '已结算');
    if (!prescription) {
      return 'skipped';
    }
    
    // 尝试更新处方
    const res = await superAdminRequest('PUT', `/api/admin/table/prescriptions/${prescription.id}`, {
      data: JSON.stringify({ name: '修改后的名字' })
    });
    
    // 应该返回错误
    assert(res.data.code !== 0, '已结算处方应该不可编辑');
  });
}

/**
 * 5. 本地数据库 Op.or 测试
 */
async function testOpOr() {
  console.log('\n--- Op.or 测试 ---');
  
  // 创建测试用户
  await test('创建Op.or测试用户', async () => {
    await superAdminRequest('POST', '/api/admin/table/users', {
      openid: 'op_or_test_1',
      name: '张三',
      phone: '13800138001'
    });
    await superAdminRequest('POST', '/api/admin/table/users', {
      openid: 'op_or_test_2', 
      name: '李四',
      phone: '13900139002'
    });
    await superAdminRequest('POST', '/api/admin/table/users', {
      openid: 'op_or_test_3',
      name: '王五',
      phone: '13700137003'
    });
  });
  
  // 测试 /api/home/users 接口的 Op.or 搜索
  await test('Op.or 搜索应返回匹配结果', async () => {
    const res = await superAdminRequest('GET', '/api/home/users?keyword=张');
    assert(res.data.code === 0, '搜索请求失败');
    // 应该返回包含"张"的用户
    assert(res.data.data.rows.length >= 1, '应至少返回1条结果');
    assert(res.data.data.rows.some(u => u.name && u.name.includes('张')), '应包含张三');
  });
  
  await test('Op.or 搜索多个条件', async () => {
    // 搜索"张"或"139"应该返回多个结果
    const res = await superAdminRequest('GET', '/api/home/users?keyword=139');
    assert(res.data.code === 0, '搜索请求失败');
    // 应该返回phone包含139的用户
    assert(res.data.data.rows.length >= 1, '应至少返回1条结果');
  });
  
  // 清理测试用户
  await test('清理Op.or测试用户', async () => {
    await superAdminRequest('POST', '/api/admin/table/users/batch-delete', {
      ids: [] // 需要先获取ID
    });
    // 简单跳过清理，测试数据不影响其他测试
    return 'skipped';
  });
}

/**
 * 清理测试数据
 */
async function cleanup() {
  console.log('\n🧹 清理测试数据...');
  
  try {
    // 清理执药单
    if (testData.outOrderId) {
      await superAdminRequest('DELETE', `/api/admin/table/stock_out_orders/${testData.outOrderId}`);
    }
    
    // 清理处方
    if (testData.prescriptionId) {
      const listRes = await superAdminRequest('GET', `/api/admin/table/prescriptions?pageSize=100`);
      for (const p of listRes.data.data.rows) {
        if (p.prescriptionId === testData.prescriptionId) {
          await superAdminRequest('DELETE', `/api/admin/table/prescriptions/${p.id}`);
        }
      }
    }
    
    console.log('✅ 数据表管理测试数据清理完成');
  } catch (error) {
    console.log('⚠️ 清理测试数据时出错:', error.message);
  }
}

/**
 * 主测试函数
 */
async function runDataManagementTests(users) {
  if (users) {
    testUsers = users;
  }
  
  console.log('\n📊 测试数据表管理改造');
  console.log('=====================================');
  
  try {
    // 1. 级联删除测试
    await testCascadeDelete();
    
    // 2. 预约状态测试
    await testBookingStatus();
    
    // 3. 处方状态测试
    await testPrescriptionStatus();
    
    // 4. 执药单结算测试
    await testOutOrderSettle();
    
    // 5. Op.or 测试
    await testOpOr();
    
  } catch (error) {
    console.error('测试执行出错:', error);
  } finally {
    await cleanup();
  }
  
  console.log('\n📊 数据表管理测试结果');
  console.log('=====================================');
  console.log(`总测试数: ${testStats.total}`);
  console.log(`通过: ${testStats.passed} ✅`);
  console.log(`失败: ${testStats.failed} ❌`);
  console.log(`跳过: ${testStats.skipped} ⏭️`);
  
  if (testStats.errors.length > 0) {
    console.log('\n❌ 失败的测试:');
    testStats.errors.forEach((err, i) => {
      console.log(`  ${i + 1}. ${err.name}: ${err.error}`);
    });
  }
  
  return testStats;
}

/**
 * 获取测试统计
 */
function getTestStats() {
  return { ...testStats };
}

module.exports = {
  runDataManagementTests,
  getTestStats
};
