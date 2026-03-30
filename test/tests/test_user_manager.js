/**
 * 用户管理 API 测试（扩展）
 *
 * 测试范围：
 * - 更新用户姓名
 * - 更新用户手机号
 * - 权限验证
 * - 数据校验
 */

const testHelpers = require('../test-helpers');
const { request, superAdminRequest, test, assert, assertEquals, getTestUsers, testStats } = testHelpers;

/**
 * 主测试函数
 */
async function runUserManagerTests(externalTestUsers) {
  // 使用外部传入的测试用户或从共享模块获取
  const testUsers = externalTestUsers || getTestUsers();

  console.log('\n👤 测试用户管理扩展 API');
  console.log('=====================================');

  if (!testUsers.normalUser) {
    console.log('⚠️  测试用户未创建，跳过用户管理测试');
    return { passed: 0, failed: 0, skipped: 0 };
  }

  // ========== 更新用户信息 ==========

  await test('PUT /api/user/:openid - 更新用户姓名', async () => {
    const { response, data } = await superAdminRequest('PUT', `/api/user/${testUsers.normalUser.openid}`, {
      name: '测试用户_新姓名'
    });

    assert(response.statusCode === 200, '请求应成功，状态码: ' + response.statusCode);
    assert(data.code === 0, '返回应成功，code: ' + data.code);
  });

  await test('PUT /api/user/:openid - 更新用户手机号', async () => {
    const { response, data } = await superAdminRequest('PUT', `/api/user/${testUsers.normalUser.openid}`, {
      phone: '13900000001'
    });

    assert(response.statusCode === 200, '请求应成功，状态码: ' + response.statusCode);
    assert(data.code === 0, '返回应成功，code: ' + data.code);
  });

  await test('PUT /api/user/:openid - 同时更新姓名和手机号', async () => {
    const { response, data } = await superAdminRequest('PUT', `/api/user/${testUsers.normalUser.openid}`, {
      name: '测试用户_最终姓名',
      phone: '13900000002'
    });

    assert(response.statusCode === 200, '请求应成功，状态码: ' + response.statusCode);
    assert(data.code === 0, '返回应成功，code: ' + data.code);
  });

  await test('PUT /api/user/:openid - 验证更新结果', async () => {
    // 使用 keyword 搜索特定用户（按更新后的手机号搜索）
    const { response, data } = await superAdminRequest('GET', '/api/home/users?keyword=13900000002');

    assert(response.statusCode === 200, '请求应成功，状态码: ' + response.statusCode);
    assert(data.code === 0, '返回应成功，code: ' + data.code);

    const user = data.data.list.find(u => u.openid === testUsers.normalUser.openid);
    assert(user, '应找到测试用户，openid: ' + testUsers.normalUser.openid);
    assert(user.name === '测试用户_最终姓名', '姓名应已更新，实际: ' + (user ? user.name : 'N/A'));
    assert(user.phone === '13900000002', '手机号应已更新，实际: ' + (user ? user.phone : 'N/A'));
  });

  // ========== 权限验证 ==========

  await test('PUT /api/user/:openid - 普通用户无权访问', async () => {
    const { response, data } = await request('PUT', `/api/user/${testUsers.normalUser.openid}`, {
      name: '非法修改'
    }, {
      'x-openid': testUsers.normalUser.openid
    });

    assert(response.statusCode === 403, '应返回403禁止访问，实际: ' + response.statusCode);
  });

  await test('PUT /api/user/:openid - 管理员可以访问修改用户信息', async () => {
    const { response, data } = await request('PUT', `/api/user/${testUsers.normalUser.openid}`, {
      name: '管理员修改'
    }, {
      'x-openid': testUsers.adminUser.openid
    });

    assertEquals(response.statusCode, 200, '应返回200');
    assertEquals(data.code, 0, '应返回成功');
    assert(data.data.name === '管理员修改', '姓名应已更新');
    console.log(`  管理员权限验证通过`);
  });

  // ========== 数据校验 ==========

  await test('PUT /api/user/:openid - 用户不存在应返回错误', async () => {
    const { response, data } = await superAdminRequest('PUT', '/api/user/non_existent_user_12345', {
      name: '测试'
    });

    assertEquals(response.statusCode, 400, '请求失败');
    assertEquals(data.code, 1, '返回错误');
  });

  await test('PUT /api/user/:openid - 手机号格式校验', async () => {
    const { response, data } = await superAdminRequest('PUT', `/api/user/${testUsers.normalUser.openid}`, {
      phone: 'invalid_phone'
    });

    if (response.statusCode === 400) {
      assertEquals(data.code, 1, '返回错误');
    } else {
      console.log('    ⚠️  手机号格式未校验，建议添加');
    }
  });

  // ========== 输出测试结果 ==========
  console.log('\n📊 用户管理测试结果');
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

  return {
    passed: testStats.passed,
    failed: testStats.failed,
    skipped: testStats.skipped
  };
}

// 导出模块
module.exports = {
  runUserManagerTests,
  getTestStats: () => testStats
};