/**
 * 登录相关API测试
 */

const testHelpers = require('../test-helpers');
const { request, test, assert, assertEquals, getTestUsers, testStats } = testHelpers;

/**
 * 导出函数
 */
async function runLoginTests() {
  console.log('\n📋 1. 测试登录相关API');

  // 获取已创建的测试用户（由 run_all.js 创建）
  const testUsers = getTestUsers();

  // 如果测试用户不存在，跳过测试
  if (!testUsers.normalUser) {
    console.log('⚠️  测试用户未创建，跳过登录测试');
    return { passed: 0, failed: 0, skipped: 0 };
  }

  // POST /api/bind-phone
  await test('POST /api/bind-phone - 绑定手机号', async () => {
    const { response, data } = await request('POST', '/api/bind-phone', {
      openid: testUsers.normalUser.openid,
      phone: '13800138001'
    });

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '绑定成功');
  });

  // POST /api/check-admin
  await test('POST /api/check-admin - 普通用户检查', async () => {
    const { response, data } = await request('POST', '/api/check-admin', {
      openid: testUsers.normalUser.openid
    });

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assertEquals(data.data.isAdmin, false, '不是管理员');
  });

  await test('POST /api/check-admin - 管理员检查', async () => {
    const { response, data } = await request('POST', '/api/check-admin', {
      openid: testUsers.adminUser.openid
    });

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assertEquals(data.data.isAdmin, true, '是管理员');
  });

  await test('POST /api/check-admin - 超级管理员检查', async () => {
    const { response, data } = await request('POST', '/api/check-admin', {
      openid: testUsers.superAdminUser.openid
    });

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assertEquals(data.data.isAdmin, true, '是管理员');
  });

  console.log('\n📊 登录测试结果');
  console.log(`  总测试数: ${testStats.total}`);
  console.log(`  通过: ${testStats.passed} ✅`);
  console.log(`  失败: ${testStats.failed} ❌`);

  return {
    passed: testStats.passed,
    failed: testStats.failed,
    skipped: testStats.skipped
  };
}

// 导出模块
module.exports = {
  runLoginTests,
  getTestUsers,
  getTestStats: () => testStats
};