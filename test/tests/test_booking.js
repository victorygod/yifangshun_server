/**
 * 预约管理API测试
 */

const { Booking } = require('../../wrappers/db-wrapper');
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
  bookingId: null
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
      await Booking.destroy({ where: { bookingId: testData.bookingId } });
    }
    console.log('✅ 预约测试数据清理完成');
  } catch (error) {
    console.log('⚠️  清理预约测试数据失败:', error.message);
  }
}

/**
 * 导出函数
 */
async function runBookingTests(testUsers) {
  console.log('\n📋 2. 测试预约管理API');
  
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
      openid: testUsers.normalUser.openid
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '预约成功');
    assert(data.data.bookingId, '返回预约ID');
    testData.bookingId = data.data.bookingId;
  });
  
  await test('POST /api/booking - 业务规则验证（不支持当日预约）', async () => {
    const today = new Date().toISOString().split('T')[0];
    
    const { response, data } = await request('POST', '/api/booking', {
      date: today,
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
  
  // DELETE /api/booking/:bookingId
  await test('DELETE /api/booking/:bookingId - 取消预约', async () => {
    if (!testData.bookingId) {
      return 'skipped';
    }
    
    const { response, data } = await request('DELETE', `/api/booking/${testData.bookingId}?openid=${testUsers.normalUser.openid}`);
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '取消成功');
  });
  
  console.log('\n📊 预约测试结果');
  console.log(`  总测试数: ${testStats.total}`);
  console.log(`  通过: ${testStats.passed} ✅`);
  console.log(`  失败: ${testStats.failed} ❌`);
}

// 导出模块
module.exports = {
  runBookingTests,
  cleanupTestData,
  getTestStats: () => testStats
};
