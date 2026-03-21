/**
 * 预约管理API测试
 */

const { Booking, ScheduleConfig } = require('../../wrappers/db-wrapper');
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
  bookingId: null,
  scheduleConfigId: null  // 新增：场次配置ID
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
  try {
    if (testData.bookingId) {
      await Booking.destroy({ where: { id: testData.bookingId } });
    }
    console.log('✅ 预约测试数据清理完成');
  } catch (error) {
    console.log('⚠️  清理预约测试数据失败:', error.message);
  }
}

/**
 * 清理场次配置测试数据
 */
async function cleanupScheduleConfigData() {
  try {
    // 删除所有 override
    await ScheduleConfig.destroy({ where: { type: 'override' } });
    
    // 重置所有 default 为初始状态（按硬编码规则）
    const DEFAULT_CLOSED_SESSIONS = {
      0: { morning: true, afternoon: false, evening: false },  // 周日
      1: { morning: true, afternoon: false, evening: false },  // 周一
      2: { morning: true, afternoon: true, evening: true },    // 周二
      3: { morning: true, afternoon: false, evening: false },  // 周三
      4: { morning: false, afternoon: true, evening: false },  // 周四
      5: { morning: true, afternoon: false, evening: false },  // 周五
      6: { morning: true, afternoon: false, evening: false }   // 周六
    };
    
    for (let day = 0; day <= 6; day++) {
      for (const session of ['morning', 'afternoon', 'evening']) {
        await ScheduleConfig.update(
          { isOpen: !DEFAULT_CLOSED_SESSIONS[day][session] },
          { where: { type: 'default', dayOfWeek: day, session } }
        );
      }
    }
    
    console.log('✅ 场次配置测试数据清理完成');
  } catch (error) {
    console.log('⚠️  清理场次配置测试数据失败:', error.message);
  }
}

/**
 * 导出函数
 */
async function runBookingTests(testUsers) {
  console.log('\n📋 2. 测试预约管理API');
  
  // ==================== 现有测试（按日预约）====================
  
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
      return date.getDay() === 2; // 2表示周二
    });
    
    // 周二的状态应该是full或不可用
    assert(tuesdaySlots.length > 0, '应该有周二');
    assertEquals(tuesdaySlots[0].status, 'full', '周二不可预约');
  });
  
  // POST /api/booking
  await test('POST /api/booking - 创建预约', async () => {
    // 计算一个不是周二的日期
    const date = new Date();
    date.setDate(date.getDate() + 7); // 7天后
    while (date.getDay() === 2) {
      date.setDate(date.getDate() + 1);
    }
    const dateStr = date.toISOString().split('T')[0];
    
    const { response, data } = await request('POST', '/api/booking', {
      date: dateStr,
      session: 'afternoon',
      personCount: 1,
      openid: testUsers.normalUser.openid
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
      personCount: 1,
      openid: testUsers.normalUser.openid
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
      personCount: 1,
      openid: testUsers.normalUser.openid
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
      personCount: 1,
      openid: testUsers.normalUser.openid
    });
    
    assertEquals(response.statusCode, 400, '请求失败');
    assertEquals(data.code, 1, '返回错误');
  });
  
  // GET /api/my-bookings
  await test('GET /api/my-bookings - 获取我的预约', async () => {
    const { response, data } = await request('GET', `/api/my-bookings?openid=${testUsers.normalUser.openid}`);
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(Array.isArray(data.data), '返回数组');
  });
  
  // DELETE /api/booking/:id
  await test('DELETE /api/booking/:id - 取消预约', async () => {
    if (!testData.bookingId) {
      return 'skipped';
    }
    
    const { response, data } = await request('DELETE', `/api/booking/${testData.bookingId}?openid=${testUsers.normalUser.openid}`);
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '取消成功');
  });
  
  // ==================== 新增测试（场次配置管理）====================
  
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
      dayOfWeek: 0,  // 周日
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
  
  // 场次预约测试（改造后才能通过）
  await test('[改造后] GET /api/available-slots - 按场次获取可预约信息', async () => {
    const { response, data } = await request('GET', '/api/available-slots');
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    
    // 检查返回结构是否包含场次信息
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
    // 计算一个不是周二的日期
    const date = new Date();
    date.setDate(date.getDate() + 7);
    while (date.getDay() === 2) {
      date.setDate(date.getDate() + 1);
    }
    const dateStr = date.toISOString().split('T')[0];
    
    const { response, data } = await request('POST', '/api/booking', {
      date: dateStr,
      session: 'afternoon',
      personCount: 2,
      openid: testUsers.normalUser.openid
    });
    
    // 改造前会失败（缺少session参数）
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
    const { response, data } = await request('GET', `/api/my-bookings?openid=${testUsers.normalUser.openid}`);
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(Array.isArray(data.data), '返回数组');
    
    // 检查是否有场次相关信息
    if (data.data.length > 0) {
      const booking = data.data[0];
      // 改造后应该包含这些字段
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
}

// 导出模块
module.exports = {
  runBookingTests,
  cleanupTestData,
  cleanupScheduleConfigData,
  getTestStats: () => testStats
};
