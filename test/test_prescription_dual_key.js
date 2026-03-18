/**
 * 处方双键查询测试
 * 测试 prescriptionId + status 双键匹配
 * 
 * 运行方式：
 * - 本地：node test/test_prescription_dual_key.js
 * - 云端：node test/test_prescription_dual_key.js --cloud
 */

const BASE_URL_LOCAL = 'http://localhost:80';
const CLOUD_URL = 'https://express-9kv9-232788-7-1410937198.sh.run.tcloudbase.com';

const isCloud = process.argv.includes('--cloud');
const BASE_URL = isCloud ? CLOUD_URL : BASE_URL_LOCAL;

// 本地和云端都使用真实 openid（需确保有 admin 权限）
const TEST_OPENID = 'o-eQz3TYzw7PJFltoyjntVijNt88';

const testStats = { total: 0, passed: 0, failed: 0, errors: [] };
const testData = {
  testOpenid: TEST_OPENID,
  createdPrescriptions: []
};

function request(method, url, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const isHttps = BASE_URL.startsWith('https');
    const httpModule = isHttps ? require('https') : require('http');
    const urlObj = new URL(url, BASE_URL);
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: { 'Content-Type': 'application/json', ...headers }
    };
    
    const req = httpModule.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ response: res, data: JSON.parse(data) }); }
        catch { resolve({ response: res, data: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test(name, testFn) {
  testStats.total++;
  console.log(`\n🧪 ${name}`);
  try {
    await testFn();
    testStats.passed++;
    console.log('✅ 通过');
  } catch (e) {
    testStats.failed++;
    testStats.errors.push({ name, error: e.message });
    console.log(`❌ 失败: ${e.message}`);
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || '断言失败'); }

async function cleanup() {
  console.log('\n🧹 清理测试数据...');
  for (const p of testData.createdPrescriptions) {
    try {
      // 使用双键删除
      await request('DELETE', `/api/prescription/${p.prescriptionId}/${p.status}?openid=${testData.testOpenid}`);
    } catch (e) {}
  }
}

async function runTests() {
  console.log('========================================');
  console.log('处方双键查询测试');
  console.log('========================================');
  console.log(`目标: ${BASE_URL}`);
  console.log(`模式: ${BASE_URL === CLOUD_URL ? '云端' : '本地'}`);
  console.log('========================================');

  // ========================================
  // 1. 保存处方 - 验证创建成功
  // ========================================
  await test('保存处方 - 创建待审核处方', async () => {
    const prescriptionId = 'DUAL_TEST_' + Date.now();
    const { response, data } = await request('POST', '/api/prescription/save', {
      openid: testData.testOpenid,
      prescriptionId,
      name: '测试用户',
      age: '30',
      date: '2026-03-18',
      rp: '当归10',
      dosage: '3',
      administrationMethod: '内服',
      medicines: [{ name: '当归', quantity: '10', note: '' }],
      doctor: '测试医师',
      thumbnail: 'test.jpg',
      skipValidation: true
    });
    
    assert(response.statusCode === 200, `状态码错误: ${response.statusCode}`);
    assert(data.code === 0, `保存失败: ${data.message}`);
    assert(data.data.prescriptionId === prescriptionId, 'prescriptionId 不匹配');
    assert(data.data.status === '待审核', '状态不是待审核');
    
    testData.createdPrescriptions.push({
      prescriptionId,
      status: '待审核'
    });
    console.log(`  prescriptionId: ${prescriptionId}`);
    console.log(`  status: 待审核`);
  });

  // ========================================
  // 2. 更新处方 - 使用双键查询
  // ========================================
  await test('更新处方 - 双键查询 (prescriptionId + status)', async () => {
    if (testData.createdPrescriptions.length === 0) throw new Error('没有测试数据');
    
    const p = testData.createdPrescriptions[0];
    const { response, data } = await request('POST', '/api/prescription/update', {
      openid: testData.testOpenid,
      prescriptionId: p.prescriptionId,
      status: p.status,
      name: '更新后的用户',
      age: '35',
      date: '2026-03-18',
      rp: '当归10 黄芪15',
      dosage: '5',
      administrationMethod: '内服',
      medicines: [
        { name: '当归', quantity: '10', note: '' },
        { name: '黄芪', quantity: '15', note: '' }
      ],
      doctor: '测试医师',
      thumbnail: 'updated.jpg'
    });
    
    console.log(`  请求参数: prescriptionId=${p.prescriptionId}, status=${p.status}`);
    console.log(`  响应状态码: ${response.statusCode}`);
    console.log(`  响应数据: ${JSON.stringify(data)}`);
    
    assert(response.statusCode === 200, `状态码错误: ${response.statusCode}`);
    assert(data.code === 0, `更新失败: ${data.message}`);
  });

  // ========================================
  // 3. 审核处方 - 使用双键查询
  // ========================================
  await test('审核处方 - 双键查询 (prescriptionId + status)', async () => {
    // 先创建一个待审核处方
    const prescriptionId = 'REVIEW_DUAL_' + Date.now();
    await request('POST', '/api/prescription/save', {
      openid: testData.testOpenid,
      prescriptionId,
      name: '待审核',
      age: '30',
      date: '2026-03-18',
      rp: '当归10',
      dosage: '3',
      administrationMethod: '内服',
      medicines: [{ name: '当归', quantity: '10', note: '' }],
      doctor: '测试医师',
      skipValidation: true
    });
    
    // 审核拒绝（删除）
    const { response, data } = await request('POST', '/api/prescription/review', {
      prescriptionId,
      status: '待审核',
      action: 'reject',
      openid: testData.testOpenid,
      reviewerName: '测试管理员'
    });
    
    console.log(`  请求参数: prescriptionId=${prescriptionId}, status=待审核, action=reject`);
    console.log(`  响应状态码: ${response.statusCode}`);
    console.log(`  响应数据: ${JSON.stringify(data)}`);
    
    assert(response.statusCode === 200, `状态码错误: ${response.statusCode}`);
    assert(data.code === 0, `审核失败: ${data.message}`);
  });

  // ========================================
  // 4. 删除处方 - 使用双键 URL
  // ========================================
  await test('删除处方 - 双键 URL (/api/prescription/:prescriptionId/:status)', async () => {
    // 先创建一个待审核处方
    const prescriptionId = 'DELETE_DUAL_' + Date.now();
    await request('POST', '/api/prescription/save', {
      openid: testData.testOpenid,
      prescriptionId,
      name: '待删除',
      age: '30',
      date: '2026-03-18',
      rp: '当归10',
      dosage: '3',
      administrationMethod: '内服',
      medicines: [{ name: '当归', quantity: '10', note: '' }],
      doctor: '测试医师',
      skipValidation: true
    });
    
    // 使用双键 URL 删除
    const { response, data } = await request(
      'DELETE',
      `/api/prescription/${prescriptionId}/待审核?openid=${testData.testOpenid}`
    );
    
    console.log(`  请求 URL: DELETE /api/prescription/${prescriptionId}/待审核`);
    console.log(`  响应状态码: ${response.statusCode}`);
    console.log(`  响应数据: ${JSON.stringify(data)}`);
    
    assert(response.statusCode === 200, `状态码错误: ${response.statusCode}`);
    assert(data.code === 0, `删除失败: ${data.message}`);
  });

  // ========================================
  // 5. 确认审核 - 使用双键查询
  // ========================================
  await test('确认审核通过 - 双键查询 (prescriptionId + status)', async () => {
    // 先创建一个待审核处方
    const prescriptionId = 'CONFIRM_DUAL_' + Date.now();
    await request('POST', '/api/prescription/save', {
      openid: testData.testOpenid,
      prescriptionId,
      name: '待确认',
      age: '30',
      date: '2026-03-18',
      rp: '当归10',
      dosage: '3',
      administrationMethod: '内服',
      medicines: [{ name: '当归', quantity: '10', note: '' }],
      doctor: '测试医师',
      skipValidation: true
    });
    
    // 确认审核通过
    const { response, data } = await request('POST', '/api/prescription/confirm-approve', {
      prescriptionId,
      status: '待审核',
      openid: testData.testOpenid
    });
    
    console.log(`  请求参数: prescriptionId=${prescriptionId}, status=待审核`);
    console.log(`  响应状态码: ${response.statusCode}`);
    console.log(`  响应数据: ${JSON.stringify(data)}`);
    
    assert(response.statusCode === 200, `状态码错误: ${response.statusCode}`);
    assert(data.code === 0, `确认审核失败: ${data.message}`);
    
    // 记录已审核的处方，用于清理
    testData.createdPrescriptions.push({ prescriptionId, status: '已审核' });
  });

  // ========================================
  // 6. 唯一性验证 - 相同 prescriptionId + status 不能重复
  // ========================================
  await test('唯一性验证 - 相同 prescriptionId + status 不能重复创建', async () => {
    const prescriptionId = 'UNIQUE_TEST_' + Date.now();
    
    // 第一次创建
    const { data: data1 } = await request('POST', '/api/prescription/save', {
      openid: testData.testOpenid,
      prescriptionId,
      name: '第一次',
      skipValidation: true
    });
    assert(data1.code === 0, '第一次创建应成功');
    
    // 第二次创建相同 prescriptionId + status
    const { data: data2 } = await request('POST', '/api/prescription/save', {
      openid: testData.testOpenid,
      prescriptionId,
      name: '第二次',
      skipValidation: true
    });
    
    console.log(`  第二次创建响应: ${JSON.stringify(data2)}`);
    assert(data2.code !== 0, '第二次创建应失败');
    assert(data2.message.includes('已存在'), '应提示已存在');
    
    // 清理
    testData.createdPrescriptions.push({ prescriptionId, status: '待审核' });
  });

  // ========================================
  // 输出结果
  // ========================================
  console.log('\n========================================');
  console.log('测试结果');
  console.log('========================================');
  console.log(`总数: ${testStats.total}`);
  console.log(`通过: ${testStats.passed} ✅`);
  console.log(`失败: ${testStats.failed} ❌`);
  
  if (testStats.errors.length > 0) {
    console.log('\n失败详情:');
    testStats.errors.forEach(e => console.log(`  - ${e.name}: ${e.error}`));
  }
  
  await cleanup();
  process.exit(testStats.failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('测试运行失败:', e);
  process.exit(1);
});
