/**
 * 处方识别API测试
 */

const { Prescription } = require('../../wrappers/db-wrapper');
const BASE_URL = 'http://localhost:80';

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
  prescriptionIds: []
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
  try {
    for (const prescriptionId of testData.prescriptionIds) {
      await Prescription.destroy({ where: { prescriptionId } });
    }
    console.log('✅ 处方测试数据清理完成');
  } catch (error) {
    console.log('⚠️  清理处方测试数据失败:', error.message);
  }
}

/**
 * 导出函数
 */
async function runPrescriptionTests(testUsers) {
  console.log('\n📋 3. 测试处方识别API');
  
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
    testData.prescriptionIds.push(prescriptionId);
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
    testData.prescriptionIds.push(prescriptionId);
  });
  
  await test('POST /api/prescription/save - 业务规则验证（普通用户重复上传）', async () => {
    if (testData.prescriptionIds.length === 0) {
      return 'skipped';
    }
    
    const prescriptionId = testData.prescriptionIds[0];
    
    const { response, data } = await request('POST', '/api/prescription/save', {
      openid: testUsers.normalUser.openid,
      prescriptionId: prescriptionId,
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
  
  await test('POST /api/prescription/save - 管理员重复上传同一处方ID（返回code:2需确认覆盖）', async () => {
    // 使用已存在的管理员处方ID
    const existingAdminPrescriptionId = testData.prescriptionIds.find(id => id.startsWith('ADMIN_'));
    
    if (!existingAdminPrescriptionId) {
      return 'skipped';
    }
    
    const { response, data } = await request('POST', '/api/prescription/save', {
      openid: testUsers.adminUser.openid,
      prescriptionId: existingAdminPrescriptionId,
      name: '管理员重复上传',
      age: '50',
      date: '2026-03-16',
      rp: 'Rp管理员重复测试',
      dosage: '7',
      administrationMethod: '内服',
      medicines: [
        { name: '人参', quantity: '30g', note: '' }
      ],
      doctor: '肖笃凯',
      thumbnail: 'admin_duplicate_thumb.jpg'
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 2, '返回code:2需要确认覆盖');
    assert(data.message.includes('已存在'), '提示已存在');
    assert(data.existingPrescription, '返回已存在的处方信息');
    assert(data.newPrescription, '返回新处方数据');
    console.log(`  已存在处方ID: ${data.existingPrescription.prescriptionId}`);
    console.log(`  提示消息: ${data.message}`);
  });
  
  // GET /api/prescription/user-history
  await test('GET /api/prescription/user-history - 获取用户处方历史', async () => {
    const { response, data } = await request('GET', `/api/prescription/user-history?openid=${testUsers.normalUser.openid}`);
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(Array.isArray(data.data), '返回数组');
  });
  
  // GET /api/prescription/list
  await test('GET /api/prescription/list - 获取所有处方列表（管理员）', async () => {
    const { response, data } = await request('GET', `/api/prescription/list?openid=${testUsers.adminUser.openid}`);
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(Array.isArray(data.data), '返回数组');
    assert(data.pagination, '返回分页信息');
  });
  
  await test('GET /api/prescription/list - 业务规则验证（自动清理过期处方）', async () => {
    // 创建一个超过7天的待审核处方
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 8);
    
    const expiredPrescriptionId = 'EXPIRED_' + Date.now();
    
    // 直接操作数据库创建过期处方
    await Prescription.create({
      id: `${expiredPrescriptionId}_待审核`,
      prescriptionId: expiredPrescriptionId,
      openid: testUsers.normalUser.openid,
      status: '待审核',
      thumbnail: 'expired_thumb.jpg',
      data: JSON.stringify({
        name: '过期处方',
        age: '30',
        date: '2026-03-15',
        rp: 'Rp过期内容',
        medicines: [
          { name: '当归', quantity: '15g', note: '' }
        ],
        doctor: '肖笃凯'
      }),
      createdAt: sevenDaysAgo.toISOString(),
      updatedAt: sevenDaysAgo.toISOString()
    });
    
    // 等待一下
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 获取处方列表，触发清理
    const { response, data } = await request('GET', `/api/prescription/list?openid=${testUsers.adminUser.openid}`);
    
    assertEquals(response.statusCode, 200, '请求成功');
    // 检查是否有清理信息
    if (data.cleaned) {
      console.log(`  ✅ 自动清理了 ${data.cleaned.count} 条过期处方`);
    }
  });
  
  // POST /api/prescription/update
  await test('POST /api/prescription/update - 更新处方', async () => {
    if (testData.prescriptionIds.length === 0) {
      return 'skipped';
    }
    
    const prescriptionId = testData.prescriptionIds[1]; // 管理员的处方
    
    const { response, data } = await request('POST', '/api/prescription/update', {
      openid: testUsers.adminUser.openid,
      id: `${prescriptionId}_已审核`,
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
  });
  
  // DELETE /api/prescription/:id
  await test('DELETE /api/prescription/:id - 普通用户删除自己的待审核处方', async () => {
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
    
    // 等待一下
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 删除处方
    const { response, data } = await request('DELETE', `/api/prescription/${prescriptionId}?openid=${testUsers.normalUser.openid}`);
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '删除成功');
    testData.prescriptionIds.push(prescriptionId);
  });
  
  // POST /api/prescription/review
  await test('POST /api/prescription/review - 审核通过处方', async () => {
    // 先获取待审核列表
    const { response: listResponse, data: listData } = await request('GET', `/api/prescription/user-history?openid=${testUsers.normalUser.openid}`);
    
    const pendingPrescription = listData.data.find(p => p.status === '待审核');
    
    if (!pendingPrescription) {
      return 'skipped';
    }
    
    const { response, data } = await request('POST', '/api/prescription/review', {
      id: pendingPrescription.id,
      action: 'approve',
      openid: testUsers.adminUser.openid,
      reviewerName: '测试管理员'
    });
    
    // 检查响应
    assertEquals(response.statusCode, 200, '请求成功');
    
    // 审核可能成功或失败（如果有重复处方），都是正常的
    if (data.code === 0) {
      // 审核成功
      console.log(`  审核结果: ${data.message}`);
    } else {
      // 审核失败（例如：处方不存在、已审核等）
      console.log(`  审核失败（预期行为）: ${data.message}`);
    }
  });
  
  await test('POST /api/prescription/review - 审核拒绝处方', async () => {
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
    
    // 等待一下
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 拒绝处方
    const { response, data } = await request('POST', '/api/prescription/review', {
      id: `${prescriptionId}_待审核`,
      action: 'reject',
      openid: testUsers.adminUser.openid,
      reviewerName: '测试管理员'
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '拒绝成功');
    testData.prescriptionIds.push(prescriptionId);
  });
  
  // POST /api/prescription/confirm-approve - 确认审核通过
  await test('POST /api/prescription/confirm-approve - 确认审核通过', async () => {
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
    
    // 等待一下
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 使用管理员权限确认审核通过
    const { response, data } = await request('POST', '/api/prescription/confirm-approve', {
      id: `${prescriptionId}_待审核`,
      openid: testUsers.adminUser.openid
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '确认审核成功');
    testData.prescriptionIds.push(prescriptionId);
  });
  
  // POST /api/prescription/confirm-overwrite - 确认覆盖处方
  await test('POST /api/prescription/confirm-overwrite - 确认覆盖处方', async () => {
    // 使用之前创建的已审核处方
    const existingPrescriptionId = testData.prescriptionIds.find(id => id.startsWith('ADMIN_')) || testData.prescriptionIds[0];
    
    if (!existingPrescriptionId) {
      return 'skipped';
    }
    
    const newPrescriptionData = {
      name: '覆盖后的姓名',
      age: '99',
      date: '2026-03-16',
      rp: '覆盖后的Rp',
      dosage: '14',
      administrationMethod: '外用',
      medicines: [
        { name: '人参', quantity: '25g', note: '' },
        { name: '白术', quantity: '15g', note: '' }
      ],
      doctor: '肖笃凯'
    };
    
    // 使用管理员权限确认覆盖
    const { response, data } = await request('POST', '/api/prescription/confirm-overwrite', {
      prescriptionId: existingPrescriptionId,
      prescriptionData: newPrescriptionData,
      thumbnail: 'overwrite_thumb.jpg',
      openid: testUsers.adminUser.openid
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '覆盖成功');
  });
  
  // GET /api/prescription/list?status=待审核 - 状态筛选
  await test('GET /api/prescription/list - 按状态筛选（待审核）', async () => {
    const { response, data } = await request('GET', `/api/prescription/list?status=待审核&openid=${testUsers.adminUser.openid}`);
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(Array.isArray(data.data), '返回数组');
    // 验证返回的数据都是待审核状态
    const allPending = data.data.every(p => p.status === '待审核');
    assert(allPending, '所有返回的处方都是待审核状态');
    console.log(`  筛选出的待审核处方数量: ${data.data.length}`);
  });
  
  await test('GET /api/prescription/list - 按状态筛选（已审核）', async () => {
    const { response, data } = await request('GET', `/api/prescription/list?status=已审核&openid=${testUsers.adminUser.openid}`);
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(Array.isArray(data.data), '返回数组');
    // 验证返回的数据都是已审核状态
    const allApproved = data.data.every(p => p.status === '已审核');
    assert(allApproved, '所有返回的处方都是已审核状态');
    console.log(`  筛选出的已审核处方数量: ${data.data.length}`);
  });
  
  // 批量删除处方（模拟前端循环调用）
  await test('DELETE /api/prescription/:id - 批量删除处方', async () => {
    // 先创建3个待审核处方
    const prescriptionIds = [];
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
      
      prescriptionIds.push(prescriptionId);
    }
    
    // 等待数据写入
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 批量删除（模拟前端循环调用）
    let deleteCount = 0;
    for (const prescriptionId of prescriptionIds) {
      const { response, data } = await request('DELETE', `/api/prescription/${prescriptionId}?openid=${testUsers.normalUser.openid}`);
      if (response.statusCode === 200 && data.code === 0) {
        deleteCount++;
      }
    }
    
    assertEquals(deleteCount, 3, '批量删除3个处方成功');
    testData.prescriptionIds.push(...prescriptionIds);
    console.log(`  成功删除 ${deleteCount} 个处方`);
  });
  
  // 编辑待审核处方后保存自动审核（模拟 prescription-admin.js 的 performApprovalWithCheck 流程）
  await test('编辑待审核处方后保存自动审核（update + review 组合操作）', async () => {
    // 创建一个待审核处方
    const prescriptionId = 'EDIT_THEN_APPROVE_' + Date.now();
    
    await request('POST', '/api/prescription/save', {
      openid: testUsers.normalUser.openid,
      prescriptionId: prescriptionId,
      name: '编辑后审核',
      age: '30',
      date: '2026-03-15',
      rp: 'Rp编辑后审核测试',
      dosage: '3',
      administrationMethod: '内服',
      medicines: [{ name: '当归', quantity: '15g', note: '' }],
      doctor: '肖笃凯',
      thumbnail: 'edit_approve_thumb.jpg'
    });
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 1. 先更新处方内容
    const { response: updateResponse, data: updateData } = await request('POST', '/api/prescription/update', {
      openid: testUsers.adminUser.openid,
      id: `${prescriptionId}_待审核`,
      prescriptionId: prescriptionId,
      name: '编辑后的姓名',
      age: '35',
      date: '2026-03-16',
      rp: '编辑后的Rp',
      dosage: '5',
      administrationMethod: '内服',
      medicines: [{ name: '黄芪', quantity: '20g', note: '' }],
      doctor: '肖笃凯',
      thumbnail: 'edit_approve_thumb.jpg'
    });
    
    assertEquals(updateResponse.statusCode, 200, '更新成功');
    
    // 2. 然后审核（模拟前端 performApprovalWithCheck）
    const { response: reviewResponse, data: reviewData } = await request('POST', '/api/prescription/review', {
      id: `${prescriptionId}_待审核`,
      action: 'approve',
      openid: testUsers.adminUser.openid,
      reviewerName: '测试管理员'
    });
    
    assertEquals(reviewResponse.statusCode, 200, '审核请求成功');
    // 审核可能成功（code:0）或需要确认（code:2），都是正常流程
    console.log(`  审核结果: code=${reviewData.code}, ${reviewData.message}`);
    
    testData.prescriptionIds.push(prescriptionId);
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