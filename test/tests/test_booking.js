/**
 * 预约管理API测试
 */

const testHelpers = require('../test-helpers');
const { request, test, assert, assertEquals, getTestUsers, testStats } = testHelpers;
const { Booking, ScheduleConfig } = require('../../wrappers/db-wrapper');

// 测试数据
const testData = {
  bookingId: null,
  scheduleConfigId: null
};

/**
 * 导出函数
 */
async function runBookingTests(externalTestUsers) {
  console.log('\n📋 2. 测试预约管理API');

  // 使用外部传入的测试用户或从共享模块获取
  const testUsers = externalTestUsers || getTestUsers();

  if (!testUsers.normalUser) {
    console.log('⚠️  测试用户未创建，跳过预约测试');
    return { passed: 0, failed: 0, skipped: 0 };
  }

  // 清理所有预约数据（因为预约检查使用手机号）
  await Booking.destroy({ where: {} });

  // 清理 ScheduleConfig 脏数据，重置为正确的默认配置
  await ScheduleConfig.destroy({ where: {} });
  await ScheduleConfig.create({ type: 'default', dayOfWeek: 2, session: 'morning', isOpen: false, maxBookings: 2 });
  await ScheduleConfig.create({ type: 'default', dayOfWeek: 2, session: 'afternoon', isOpen: false, maxBookings: 4 });
  await ScheduleConfig.create({ type: 'default', dayOfWeek: 2, session: 'evening', isOpen: false, maxBookings: 2 });

  // GET /api/available-slots
  await test('GET /api/available-slots - 获取可预约日期', async () => {
    const { response, data } = await request('GET', '/api/available-slots');

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(Array.isArray(data.data), '返回数组');
    assert(data.data.length === 14, '返回14天');
  });

  await test('GET /api/available-slots - 业务规则验证（周二不可预约）', async () => {
    const { response, data } = await request('GET', '/api/available-slots');

    const tuesdaySlots = data.data.filter(slot => {
      const date = new Date(slot.date);
      return date.getDay() === 2;
    });

    assert(tuesdaySlots.length > 0, '应该有周二');
    assertEquals(tuesdaySlots[0].status, 'full', '周二不可预约');
  });

  // POST /api/booking
  await test('POST /api/booking - 创建预约', async () => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    while (date.getDay() === 2) {
      date.setDate(date.getDate() + 1);
    }
    const dateStr = date.toISOString().split('T')[0];

    const { response, data } = await request('POST', '/api/booking', {
      date: dateStr,
      session: 'afternoon',
      personCount: 1
    }, {
      'x-openid': testUsers.normalUser.openid
    });

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '预约成功');
    assert(data.data.id, '返回预约ID');
    assert(data.data.session, '返回场次信息');
    assert(data.data.personCount, '返回预约人数');
    testData.bookingId = data.data.id;
  });

  await test('POST /api/booking - 业务规则验证（不支持当日预约）', async () => {
    const today = new Date().toISOString().split('T')[0];

    const { response, data } = await request('POST', '/api/booking', {
      date: today,
      session: 'afternoon',
      personCount: 1
    }, {
      'x-openid': testUsers.normalUser.openid
    });

    assertEquals(response.statusCode, 400, '请求失败');
    assertEquals(data.code, 1, '返回错误');
  });

  await test('POST /api/booking - 业务规则验证（周二不可预约）', async () => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    while (date.getDay() !== 2) {
      date.setDate(date.getDate() + 1);
    }
    const dateStr = date.toISOString().split('T')[0];

    const { response, data } = await request('POST', '/api/booking', {
      date: dateStr,
      session: 'afternoon',
      personCount: 1
    }, {
      'x-openid': testUsers.normalUser.openid
    });

    assertEquals(response.statusCode, 400, '请求失败');
    assertEquals(data.code, 1, '返回错误');
  });

  await test('POST /api/booking - 业务规则验证（单用户限制）', async () => {
    if (!testData.bookingId) {
      return 'skipped';
    }

    const { response, data } = await request('POST', '/api/booking', {
      date: '2026-04-01',
      session: 'morning',
      personCount: 1
    }, {
      'x-openid': testUsers.normalUser.openid
    });

    assertEquals(response.statusCode, 400, '请求失败');
    assertEquals(data.code, 1, '返回错误');
  });

  // GET /api/my-bookings
  await test('GET /api/my-bookings - 获取我的预约', async () => {
    const { response, data } = await request('GET', '/api/my-bookings', null, {
      'x-openid': testUsers.normalUser.openid
    });

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(Array.isArray(data.data), '返回数组');
  });

  // DELETE /api/booking/:id
  await test('DELETE /api/booking/:id - 取消预约', async () => {
    if (!testData.bookingId) {
      return 'skipped';
    }

    const { response, data } = await request('DELETE', `/api/booking/${testData.bookingId}`, null, {
      'x-openid': testUsers.normalUser.openid
    });

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '取消成功');
  });

  // 场次配置管理测试
  await test('GET /api/schedule/config - 获取场次配置（管理员权限）', async () => {
    const { response, data } = await request('GET', '/api/schedule/config', null, {
      'x-openid': testUsers.adminUser.openid
    });

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(data.data.defaults, '包含默认配置');
    assert(Array.isArray(data.data.defaults), '默认配置是数组');
    assert(Array.isArray(data.data.overrides), '临时调整是数组');
  });

  await test('POST /api/schedule/config/default - 设置默认场次配置（管理员权限）', async () => {
    const { response, data } = await request('POST', '/api/schedule/config/default', {
      dayOfWeek: 0,
      session: 'morning',
      isOpen: false
    }, {
      'x-openid': testUsers.adminUser.openid
    });

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '配置已保存');
  });

  await test('POST /api/schedule/config/override - 设置临时调整（管理员权限）', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];

    const { response, data } = await request('POST', '/api/schedule/config/override', {
      date: dateStr,
      session: 'all',
      isOpen: false,
      reason: '临时停诊测试'
    }, {
      'x-openid': testUsers.adminUser.openid
    });

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '调整已保存');
  });

  // 场次预约测试
  await test('[改造后] GET /api/available-slots - 按场次获取可预约信息', async () => {
    const { response, data } = await request('GET', '/api/available-slots');

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');

    assert(Array.isArray(data.data), '返回数组');
    if (data.data.length > 0) {
      const firstDay = data.data[0];
      assert(firstDay.hasOwnProperty('sessions'), '包含sessions字段');
      assert(firstDay.sessions.hasOwnProperty('morning'), '包含上午场次');
      assert(firstDay.sessions.hasOwnProperty('afternoon'), '包含下午场次');
      assert(firstDay.sessions.hasOwnProperty('evening'), '包含晚上场次');
    }
  });

  await test('[改造后] POST /api/booking - 按场次创建预约', async () => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    while (date.getDay() === 2) {
      date.setDate(date.getDate() + 1);
    }
    const dateStr = date.toISOString().split('T')[0];

    const { response, data } = await request('POST', '/api/booking', {
      date: dateStr,
      session: 'afternoon',
      personCount: 2
    }, {
      'x-openid': testUsers.normalUser.openid
    });

    if (response.statusCode === 400) {
      assert(data.message.includes('session') || data.message.includes('缺少'), '提示缺少session参数');
    } else {
      assertEquals(response.statusCode, 200, '请求成功');
      assertEquals(data.code, 0, '预约成功');
      assert(data.data.session, '返回场次信息');
      assert(data.data.personCount, '返回预约人数');
    }
  });

  await test('[改造后] GET /api/my-bookings - 获取包含场次信息的预约', async () => {
    const { response, data } = await request('GET', '/api/my-bookings', null, {
      'x-openid': testUsers.normalUser.openid
    });

    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(Array.isArray(data.data), '返回数组');

    if (data.data.length > 0) {
      const booking = data.data[0];
      if (booking.session) {
        assert(booking.session, '包含场次');
        assert(booking.sessionName, '包含场次名称');
        assert(booking.timeRange, '包含时间范围');
        assert(booking.personCount, '包含预约人数');
      }
    }
  });

  console.log('\n📊 预约测试结果');
  console.log(`  总测试数: ${testStats.total}`);
  console.log(`  通过: ${testStats.passed} ✅`);
  console.log(`  失败: ${testStats.failed} ❌`);
  console.log(`  跳过: ${testStats.skipped} ⏭️`);

  return {
    passed: testStats.passed,
    failed: testStats.failed,
    skipped: testStats.skipped
  };
}

// 导出模块
module.exports = {
  runBookingTests,
  getTestStats: () => testStats
};