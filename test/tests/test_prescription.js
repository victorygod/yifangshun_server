/**
 * 处方识别API测试（双键查询模式）
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
  prescriptionIds: []  // 存储 { prescriptionId, status } 对象
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
 * 清理测试数据
 */
async function cleanupTestData() {
  if (testData.prescriptionIds.length === 0) return;
  
  console.log('\n🧹 清理测试数据...');
  
  for (const item of testData.prescriptionIds) {
    try {
      await request('DELETE', `/api/prescription/${encodeURIComponent(item.prescriptionId)}/${encodeURIComponent(item.status)}?openid=test_cleanup`);
    } catch (e) {
      // 忽略清理错误
    }
  }
  
  console.log('✅ 处方测试数据清理完成');
}

/**
 * 导出函数
 */
async function runPrescriptionTests(testUsers) {
  console.log('\n📋 3. 测试处方识别API（双键查询模式）');
  
  // POST /api/prescription/save
  await test('POST /api/prescription/save - 普通用户保存处方（待审核）', async () => {
    const prescriptionId = 'NORMAL_' + Date.now();
    
    const { response, data } = await request('POST', '/api/prescription/save', {
      openid: testUsers.normalUser.openid,
      prescriptionId: prescriptionId,
      name: '张三',
      age: '35',
      date: '2026-03-15',
      rp: 'Rp测试内容',
      dosage: '3',
      administrationMethod: '内服',
      medicines: [
        { name: '当归', quantity: '15g', note: '先煎' },
        { name: '黄芪', quantity: '20g', note: '' }
      ],
      doctor: '肖笃凯',
      thumbnail: 'test_thumb.jpg'
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '保存成功');
    testData.prescriptionIds.push({ prescriptionId, status: '待审核' });
  });
  
  await test('POST /api/prescription/save - 管理员保存处方（已审核）', async () => {
    const prescriptionId = 'ADMIN_' + Date.now();
    
    const { response, data } = await request('POST', '/api/prescription/save', {
      openid: testUsers.adminUser.openid,
      prescriptionId: prescriptionId,
      name: '管理员',
      age: '45',
      date: '2026-03-15',
      rp: '管理员Rp内容',
      dosage: '5',
      administrationMethod: '外用',
      medicines: [
        { name: '薄荷', quantity: '10g', note: '后下' }
      ],
      doctor: '肖笃凯',
      thumbnail: 'admin_thumb.jpg',
      skipValidation: false
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '保存成功');
    testData.prescriptionIds.push({ prescriptionId, status: '已审核' });
  });
  
  await test('POST /api/prescription/save - 业务规则验证（普通用户重复上传）', async () => {
    if (testData.prescriptionIds.length === 0) {
      return 'skipped';
    }
    
    const firstItem = testData.prescriptionIds[0];
    
    const { response, data } = await request('POST', '/api/prescription/save', {
      openid: testUsers.normalUser.openid,
      prescriptionId: firstItem.prescriptionId,
      name: '重复上传',
      age: '30',
      date: '2026-03-15',
      rp: 'Rp重复内容',
      dosage: '3',
      administrationMethod: '内服',
      medicines: [
        { name: '当归', quantity: '15g', note: '' }
      ],
      doctor: '肖笃凯',
      thumbnail: 'duplicate_thumb.jpg'
    });
    
    assertEquals(response.statusCode, 400, '请求失败');
    assertEquals(data.code, 1, '返回错误');
    assert(data.message.includes('已存在'), '提示已存在');
  });
  
  await test('POST /api/prescription/save - 业务规则验证（缺少处方ID）', async () => {
    const { response, data } = await request('POST', '/api/prescription/save', {
      openid: testUsers.normalUser.openid,
      name: '张三',
      age: '35',
      date: '2026-03-15',
      rp: 'Rp测试内容',
      dosage: '3',
      administrationMethod: '内服',
      medicines: [
        { name: '当归', quantity: '15g', note: '' }
      ],
      doctor: '肖笃凯',
      thumbnail: 'test_thumb.jpg'
    });
    
    assertEquals(response.statusCode, 400, '请求失败');
    assertEquals(data.code, 1, '返回错误');
    assert(data.message.includes('缺少处方ID'), '提示缺少处方ID');
  });
  
  // GET /api/prescription/user-history
  await test('GET /api/prescription/user-history - 获取用户处方历史', async () => {
    const { response, data } = await request('GET', `/api/prescription/user-history`, null, {
      'x-openid': testUsers.normalUser.openid
    });

    console.log(`  响应状态码：${response.statusCode}, data.code: ${data.code}`);
    console.log(`  响应数据：`, JSON.stringify(data).substring(0, 200));
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(Array.isArray(data.data?.rows), '返回 { rows, pagination } 格式');
  });
  
  // GET /api/prescription/list
  await test('GET /api/prescription/list - 获取所有处方列表（管理员）', async () => {
    const { response, data } = await request('GET', `/api/prescription/list`, null, {
      'x-openid': testUsers.adminUser.openid
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(Array.isArray(data.data?.rows), '返回 { rows, pagination } 格式');
    assert(data.data?.pagination, '返回分页信息');
  });
  
  // POST /api/prescription/update - 双键查询
  await test('POST /api/prescription/update - 更新处方（双键查询）', async () => {
    if (testData.prescriptionIds.length === 0) {
      return 'skipped';
    }
    
    // 找一个待审核的处方
    const pendingItem = testData.prescriptionIds.find(item => item.status === '待审核');
    if (!pendingItem) {
      return 'skipped';
    }
    
    const { response, data } = await request('POST', '/api/prescription/update', {
      openid: testUsers.adminUser.openid,
      prescriptionId: pendingItem.prescriptionId,
      status: pendingItem.status,
      name: '修改后的姓名',
      age: '36',
      date: '2026-03-16',
      rp: '修改后的Rp',
      dosage: '7',
      administrationMethod: '内服',
      medicines: [
        { name: '黄芪', quantity: '20g', note: '' }
      ],
      doctor: '肖笃凯',
      thumbnail: 'updated_thumb.jpg'
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '更新成功');
    console.log(`  双键查询: prescriptionId=${pendingItem.prescriptionId}, status=${pendingItem.status}`);
  });
  
  // DELETE /api/prescription/:prescriptionId/:status - 双键URL
  await test('DELETE /api/prescription/:prescriptionId/:status - 删除处方（双键URL）', async () => {
    // 先创建一个待审核处方
    const prescriptionId = 'DELETE_TEST_' + Date.now();
    
    await request('POST', '/api/prescription/save', {
      openid: testUsers.normalUser.openid,
      prescriptionId: prescriptionId,
      name: '待删除',
      age: '30',
      date: '2026-03-15',
      rp: 'Rp删除测试',
      dosage: '3',
      administrationMethod: '内服',
      medicines: [
        { name: '当归', quantity: '15g', note: '' }
      ],
      doctor: '肖笃凯',
      thumbnail: 'delete_thumb.jpg'
    });
    
    // 使用双键URL删除
    const { response, data } = await request('DELETE', `/api/prescription/${encodeURIComponent(prescriptionId)}/待审核`, null, {
      'x-openid': testUsers.normalUser.openid
    });
    
    console.log(`  删除响应：statusCode=${response.statusCode}, code=${data.code}, message=${data.message}`);
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '删除成功');
    console.log(`  双键URL: DELETE /api/prescription/${prescriptionId}/待审核`);
  });
  
  // POST /api/prescription/review - 双键查询
  await test('POST /api/prescription/review - 审核拒绝处方（双键查询）', async () => {
    // 先创建一个待审核处方
    const prescriptionId = 'REJECT_TEST_' + Date.now();
    
    await request('POST', '/api/prescription/save', {
      openid: testUsers.normalUser.openid,
      prescriptionId: prescriptionId,
      name: '待拒绝',
      age: '30',
      date: '2026-03-15',
      rp: 'Rp拒绝测试',
      dosage: '3',
      administrationMethod: '内服',
      medicines: [
        { name: '当归', quantity: '15g', note: '' }
      ],
      doctor: '肖笃凯',
      thumbnail: 'reject_thumb.jpg'
    });
    
    // 使用双键参数审核拒绝
    const { response, data } = await request('POST', '/api/prescription/review', {
      prescriptionId: prescriptionId,
      status: '待审核',
      action: 'reject',
      reviewerName: '测试管理员'
    }, {
      'x-openid': testUsers.adminUser.openid
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '拒绝成功');
    console.log(`  双键查询: prescriptionId=${prescriptionId}, status=待审核`);
  });
  
  // POST /api/prescription/review - 审核通过
  await test('POST /api/prescription/review - 审核通过处方（双键查询）', async () => {
    // 先创建一个待审核处方
    const prescriptionId = 'APPROVE_TEST_' + Date.now();
    
    await request('POST', '/api/prescription/save', {
      openid: testUsers.normalUser.openid,
      prescriptionId: prescriptionId,
      name: '待审核通过',
      age: '30',
      date: '2026-03-15',
      rp: 'Rp审核通过测试',
      dosage: '3',
      administrationMethod: '内服',
      medicines: [
        { name: '当归', quantity: '15g', note: '' }
      ],
      doctor: '肖笃凯',
      thumbnail: 'approve_thumb.jpg'
    });
    
    // 使用双键参数审核通过
    const { response, data } = await request('POST', '/api/prescription/review', {
      prescriptionId: prescriptionId,
      status: '待审核',
      action: 'approve',
      reviewerName: '测试管理员'
    }, {
      'x-openid': testUsers.adminUser.openid
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    // 审核可能成功（code:0）或需要确认（code:2）
    console.log(`  审核结果: code=${data.code}, ${data.message}`);
    
    if (data.code === 0) {
      testData.prescriptionIds.push({ prescriptionId, status: '已审核' });
    }
  });
  
  // POST /api/prescription/confirm-approve - 双键查询
  await test('POST /api/prescription/confirm-approve - 确认审核通过（双键查询）', async () => {
    // 先创建一个待审核处方
    const prescriptionId = 'CONFIRM_APPROVE_' + Date.now();
    
    await request('POST', '/api/prescription/save', {
      openid: testUsers.normalUser.openid,
      prescriptionId: prescriptionId,
      name: '待确认审核',
      age: '30',
      date: '2026-03-15',
      rp: 'Rp确认审核测试',
      dosage: '3',
      administrationMethod: '内服',
      medicines: [
        { name: '当归', quantity: '15g', note: '' }
      ],
      doctor: '肖笃凯',
      thumbnail: 'confirm_thumb.jpg'
    });
    
    // 使用双键参数确认审核通过
    const { response, data } = await request('POST', '/api/prescription/confirm-approve', {
      prescriptionId: prescriptionId,
      status: '待审核'
    }, {
      'x-openid': testUsers.adminUser.openid
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '确认审核成功');
    console.log(`  双键查询: prescriptionId=${prescriptionId}, status=待审核`);
  });
  
  // 唯一性验证
  await test('唯一性验证 - 相同 prescriptionId + status 不能重复创建', async () => {
    const prescriptionId = 'UNIQUE_TEST_' + Date.now();
    
    // 第一次创建
    const { response: r1, data: d1 } = await request('POST', '/api/prescription/save', {
      openid: testUsers.normalUser.openid,
      prescriptionId: prescriptionId,
      name: '唯一性测试',
      age: '30',
      date: '2026-03-15',
      rp: 'Rp唯一性测试',
      dosage: '3',
      administrationMethod: '内服',
      medicines: [{ name: '当归', quantity: '15g', note: '' }],
      doctor: '肖笃凯',
      thumbnail: 'unique_thumb.jpg'
    });
    
    assertEquals(r1.statusCode, 200, '第一次创建成功');
    assertEquals(d1.code, 0, '第一次创建返回code:0');
    
    // 第二次创建相同 prescriptionId + status（待审核）
    const { response: r2, data: d2 } = await request('POST', '/api/prescription/save', {
      openid: testUsers.normalUser.openid,
      prescriptionId: prescriptionId,
      name: '重复创建',
      age: '30',
      date: '2026-03-15',
      rp: 'Rp重复创建',
      dosage: '3',
      administrationMethod: '内服',
      medicines: [{ name: '黄芪', quantity: '20g', note: '' }],
      doctor: '肖笃凯',
      thumbnail: 'unique_thumb2.jpg'
    });
    
    assertEquals(r2.statusCode, 400, '第二次创建失败');
    assertEquals(d2.code, 1, '返回错误');
    assert(d2.message.includes('已存在'), '提示已存在');
    
    testData.prescriptionIds.push({ prescriptionId, status: '待审核' });
  });
  
  // 批量删除处方（模拟前端循环调用双键URL）
  await test('DELETE /api/prescription/:prescriptionId/:status - 批量删除处方', async () => {
    // 先创建3个待审核处方
    const items = [];
    for (let i = 0; i < 3; i++) {
      const prescriptionId = 'BATCH_DELETE_' + i + '_' + Date.now();
      
      await request('POST', '/api/prescription/save', {
        openid: testUsers.normalUser.openid,
        prescriptionId: prescriptionId,
        name: `批量删除测试${i}`,
        age: '30',
        date: '2026-03-15',
        rp: `Rp批量删除测试${i}`,
        dosage: '3',
        administrationMethod: '内服',
        medicines: [{ name: '当归', quantity: '15g', note: '' }],
        doctor: '肖笃凯',
        thumbnail: `batch_thumb_${i}.jpg`
      });
      
      items.push({ prescriptionId, status: '待审核' });
    }
    
    // 批量删除（使用双键URL）
    let deleteCount = 0;
    for (const item of items) {
      const { response, data } = await request('DELETE', `/api/prescription/${encodeURIComponent(item.prescriptionId)}/${encodeURIComponent(item.status)}`, null, {
      'x-openid': testUsers.normalUser.openid
    });
      if (response.statusCode === 200 && data.code === 0) {
        deleteCount++;
      }
    }
    
    assertEquals(deleteCount, 3, '批量删除3个处方成功');
    console.log(`  成功删除 ${deleteCount} 个处方`);
  });
  
  console.log('\n📊 处方测试结果');
  console.log(`  总测试数: ${testStats.total}`);
  console.log(`  通过: ${testStats.passed} ✅`);
  console.log(`  失败: ${testStats.failed} ❌`);
}

// 导出模块
module.exports = {
  runPrescriptionTests,
  cleanupTestData,
  getTestStats: () => testStats
};
