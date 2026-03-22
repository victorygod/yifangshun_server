/**
 * 最小化复现测试 - 验证 booking phone 字段问题
 */

const { Booking, User, ScheduleConfig } = require('./wrappers/db-wrapper');
const http = require('http');

const BASE_URL = 'http://localhost:80';

function request(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            data: JSON.parse(body)
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            data: body
          });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function runMinimalTest() {
  console.log('=== 最小化复现测试 ===\n');
  
  try {
    // 0. 清理旧数据
    console.log('0. 清理旧数据...');
    await Booking.destroy({ where: {}, truncate: true });
    await User.destroy({ where: {}, truncate: true });
    await ScheduleConfig.destroy({ where: {}, truncate: true });
    
    // 设置周二停诊配置
    await ScheduleConfig.create({ type: 'default', dayOfWeek: 2, session: 'morning', isOpen: false, maxBookings: 2 });
    await ScheduleConfig.create({ type: 'default', dayOfWeek: 2, session: 'afternoon', isOpen: false, maxBookings: 4 });
    await ScheduleConfig.create({ type: 'default', dayOfWeek: 2, session: 'evening', isOpen: false, maxBookings: 2 });
    console.log('   清理完成\n');
    
    // 1. 创建测试用户（模拟 test_login.js 的逻辑）
    console.log('1. 创建测试用户...');
    const openid = 'test_minimal_user_' + Date.now();
    const phone = '13800138000';
    
    await User.create({
      openid,
      code: 'test_user',
      name: '测试用户',
      phone,
      isNewUser: false,
      role: 'user'
    });
    console.log(`   用户创建成功：openid=${openid}, phone=${phone}`);
    
    // 2. 计算一个非周二的日期（7 天后）
    const date = new Date();
    date.setDate(date.getDate() + 7);
    while (date.getDay() === 2) {
      date.setDate(date.getDate() + 1);
    }
    const dateStr = date.toISOString().split('T')[0];
    console.log(`\n2. 预约日期：${dateStr} (星期${['日','一','二','三','四','五','六'][date.getDay()]})`);
    
    // 3. 创建预约（通过 API）
    console.log('\n3. 调用 POST /api/booking 创建预约...');
    const createRes = await request('POST', '/api/booking', {
      date: dateStr,
      session: 'afternoon',
      personCount: 1
    }, {
      'x-openid': openid
    });
    console.log('   创建结果:', JSON.stringify(createRes.data, null, 2));
    
    if (createRes.data.code !== 0) {
      console.log('   ❌ 创建失败，无法继续测试');
      return;
    }
    
    const bookingId = createRes.data.data?.id;
    console.log(`   ✅ 预约创建成功，ID=${bookingId}`);
    
    // 4. 直接查询数据库验证 phone 字段
    console.log('\n4. 查询数据库验证 phone 字段...');
    const booking = await Booking.findOne({ where: { id: bookingId } });
    console.log('   数据库中的 booking 记录:', {
      id: booking.id,
      openid: booking.openid,
      phone: booking.phone,
      date: booking.date,
      session: booking.session
    });
    
    // 5. 取消预约（通过 API）
    console.log(`\n5. 调用 DELETE /api/booking/${bookingId} 取消预约...`);
    const cancelRes = await request('DELETE', `/api/booking/${bookingId}`, null, {
      'x-openid': openid
    });
    console.log('   取消结果:', JSON.stringify(cancelRes.data, null, 2));
    
    if (cancelRes.data.code === 0) {
      console.log('   ✅ 预约取消成功');
    } else {
      console.log('   ❌ 预约取消失败:', cancelRes.data.message);
      
      // 诊断：比较 phone 值
      console.log('\n   诊断信息:');
      console.log('   - booking.phone:', booking.phone);
      console.log('   - user.phone:', phone);
      console.log('   - 是否相等:', booking.phone === phone);
    }
    
    // 6. 验证取消结果
    console.log('\n6. 验证取消结果...');
    const cancelledBooking = await Booking.findOne({ where: { id: bookingId } });
    console.log('   数据库中该预约:', cancelledBooking ? '仍然存在（未删除）' : '已删除');
    
    console.log('\n=== 测试完成 ===');
    
  } catch (error) {
    console.error('测试出错:', error);
  } finally {
    // 清理
    try {
      await Booking.destroy({ where: {}, truncate: true });
      await User.destroy({ where: {}, truncate: true });
      await ScheduleConfig.destroy({ where: {}, truncate: true });
      console.log('\n已清理测试数据');
    } catch (e) {}
    process.exit(0);
  }
}

// 检查服务器是否运行
function checkServer() {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE_URL}/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000);
  });
}

async function main() {
  console.log('检查服务器状态...');
  const serverRunning = await checkServer();
  
  if (!serverRunning) {
    console.log('❌ 服务器未运行，无法测试');
    process.exit(1);
  }
  
  console.log('✅ 服务器运行中\n');
  await runMinimalTest();
}

main();
