/**
 * API权限测试脚本
 * 测试当前API的权限控制情况
 */

const http = require('http');
const BASE_URL = 'http://localhost:80';

// 导入数据库wrapper，用于直接操作数据库
const { User, Prescription } = require('../wrappers/db-wrapper');

// 测试结果记录
const testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

/**
 * 测试工具函数
 */
async function testApi(description, testFn) {
  console.log(`\n🧪 测试: ${description}`);
  try {
    await testFn();
    testResults.passed++;
    testResults.tests.push({ description, status: 'passed' });
    console.log('✅ 通过');
  } catch (error) {
    testResults.failed++;
    testResults.tests.push({ description, status: 'failed', error: error.message });
    console.log(`❌ 失败: ${error.message}`);
  }
}

function request(method, url, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url, BASE_URL);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
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
 * 测试套件
 */
async function runTests() {
  console.log('========================================');
  console.log('开始运行API权限测试');
  console.log('========================================');

  // 1. 测试 GET /api/users
  await testGetUsers();

  // 2. 测试 GET /api/prescription/list
  await testGetPrescriptionList();

  // 3. 测试 POST /api/prescription/update
  await testUpdatePrescription();

  // 输出测试结果
  console.log('\n========================================');
  console.log('测试结果汇总');
  console.log('========================================');
  console.log(`总测试数: ${testResults.passed + testResults.failed}`);
  console.log(`通过: ${testResults.passed}`);
  console.log(`失败: ${testResults.failed}`);

  if (testResults.failed > 0) {
    console.log('\n失败的测试:');
    testResults.tests.filter(t => t.status === 'failed').forEach(t => {
      console.log(`  - ${t.description}: ${t.error}`);
    });
  }

  process.exit(testResults.failed > 0 ? 1 : 0);
}

/**
 * 1. 测试 GET /api/users
 */
async function testGetUsers() {
  console.log('\n📋 测试 GET /api/users');

  // 测试1：不提供任何openid，看看能否访问
  await testApi('GET /api/users - 不提供openid', async () => {
    const { response, data } = await request('GET', '/api/users');

    console.log(`  状态码: ${response.statusCode}`);
    console.log(`  返回数据:`, JSON.stringify(data, null, 2));

    // 当前行为：任何人都可以访问
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
  });

  // 测试2：提供openid，看看能否访问
  const testUser = await User.findOne({ where: { phone: { [require('sequelize').Op.ne]: null } } });
  if (testUser) {
    await testApi('GET /api/users - 提供openid', async () => {
      const { response, data } = await request('GET', `/api/users?openid=${testUser.openid}`);

      console.log(`  状态码: ${response.statusCode}`);
      console.log(`  返回数据:`, JSON.stringify(data, null, 2));

      // 当前行为：任何人都可以访问
      assertEquals(response.statusCode, 200, '请求成功');
      assertEquals(data.code, 0, '返回成功');
    });
  }
}

/**
 * 2. 测试 GET /api/prescription/list
 */
async function testGetPrescriptionList() {
  console.log('\n📋 测试 GET /api/prescription/list');

  // 测试1：不提供任何openid，看看能否访问
  await testApi('GET /api/prescription/list - 不提供openid', async () => {
    const { response, data } = await request('GET', '/api/prescription/list');

    console.log(`  状态码: ${response.statusCode}`);
    console.log(`  返回数据:`, JSON.stringify(data, null, 2));

    // 当前行为：任何人都可以访问
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
  });

  // 测试2：提供openid，看看能否访问
  const testUser = await User.findOne({ where: { phone: { [require('sequelize').Op.ne]: null } } });
  if (testUser) {
    await testApi('GET /api/prescription/list - 提供openid', async () => {
      const { response, data } = await request('GET', `/api/prescription/list?openid=${testUser.openid}`);

      console.log(`  状态码: ${response.statusCode}`);
      console.log(`  返回数据:`, JSON.stringify(data, null, 2));

      // 当前行为：任何人都可以访问
      assertEquals(response.statusCode, 200, '请求成功');
      assertEquals(data.code, 0, '返回成功');
    });
  }
}

/**
 * 3. 测试 POST /api/prescription/update
 */
async function testUpdatePrescription() {
  console.log('\n📋 测试 POST /api/prescription/update');

  // 先创建一个测试处方
  const testUser = await User.findOne({ where: { phone: { [require('sequelize').Op.ne]: null } } });
  if (!testUser) {
    console.log('⚠️  没有找到测试用户，跳过更新处方测试');
    return;
  }

  // 创建测试处方
  const prescriptionId = 'TEST_PERMISSION_' + Date.now();
  const prescriptionData = {
    name: '测试权限',
    age: '30',
    date: '2026-03-16',
    rp: 'Rp测试',
    dosage: '3',
    administrationMethod: '内服',
    medicines: [
      { name: '当归', quantity: '15g', note: '' }
    ],
    doctor: '测试医师'
  };

  await testApi('创建测试处方', async () => {
    const { response, data } = await request('POST', '/api/prescription/save', {
      openid: testUser.openid,
      thumbnail: 'test.jpg',
      ...prescriptionData
    });

    console.log(`  状态码: ${response.statusCode}`);
    console.log(`  返回数据:`, JSON.stringify(data, null, 2));

    assertEquals(response.statusCode, 200, '创建成功');
    assertEquals(data.code, 0, '返回成功');
  });

  // 等待一下，确保处方已创建
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 测试1：不提供openid，看看能否更新
  await testApi('POST /api/prescription/update - 不提供openid', async () => {
    const { response, data } = await request('POST', '/api/prescription/update', {
      id: `${prescriptionId}_待审核`,
      name: '修改后的姓名',
      age: '31',
      date: '2026-03-17',
      rp: '修改后的Rp',
      dosage: '5',
      administrationMethod: '外用',
      medicines: [
        { name: '黄芪', quantity: '20g', note: '' }
      ],
      doctor: '修改后的医师'
    });

    console.log(`  状态码: ${response.statusCode}`);
    console.log(`  返回数据:`, JSON.stringify(data, null, 2));

    // 当前行为：任何人都可以更新
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
  });

  // 测试2：提供openid，看看能否更新
  await testApi('POST /api/prescription/update - 提供openid', async () => {
    const { response, data } = await request('POST', '/api/prescription/update', {
      openid: testUser.openid,
      id: `${prescriptionId}_待审核`,
      name: '再次修改的姓名',
      age: '32',
      date: '2026-03-18',
      rp: '再次修改后的Rp',
      dosage: '7',
      administrationMethod: '内服',
      medicines: [
        { name: '人参', quantity: '10g', note: '' }
      ],
      doctor: '再次修改后的医师'
    });

    console.log(`  状态码: ${response.statusCode}`);
    console.log(`  返回数据:`, JSON.stringify(data, null, 2));

    // 当前行为：任何人都可以更新
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
  });

  // 清理测试数据
  await testApi('清理测试处方', async () => {
    try {
      await request('DELETE', `/api/prescription/${prescriptionId}?openid=${testUser.openid}`);
      console.log('✅ 测试处方已清理');
    } catch (error) {
      console.log('⚠️  清理测试处方失败:', error.message);
    }
  });
}

// 运行测试
runTests().catch(error => {
  console.error('测试运行失败:', error);
  process.exit(1);
});
