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

async function runTest() {
  console.log('=== 开始完整测试流程 ===\n');
  
  try {
    // 1. 创建测试用户
    console.log('1. 创建测试用户...');
    const userRes = await request('POST', '/api/user/create', {
      openid: 'test_flow_user',
      name: '测试用户',
      role: 'user'
    });
    console.log('   用户创建:', userRes.data.code === 0 ? '成功' : '失败', userRes.data);
    
    // 2. 绑定手机号
    console.log('\n2. 绑定手机号...');
    const bindRes = await request('POST', '/api/bind-phone', {
      phone: '13800138000'
    }, {
      'x-openid': 'test_flow_user'
    });
    console.log('   手机号绑定:', bindRes.data.code === 0 ? '成功' : '失败', bindRes.data);
    
    // 3. 创建预约
    console.log('\n3. 创建预约...');
    const createBookingRes = await request('POST', '/api/booking', {
      date: '2026-04-01',
      session: 'afternoon',
      personCount: 1
    }, {
      'x-openid': 'test_flow_user'
    });
    console.log('   预约创建:', createBookingRes.data.code === 0 ? '成功' : '失败', createBookingRes.data);
    
    const bookingId = createBookingRes.data.data?.id;
    
    // 4. 获取我的预约（验证 phone 查询）
    console.log('\n4. 获取我的预约...');
    const myBookingsRes = await request('GET', '/api/my-bookings', null, {
      'x-openid': 'test_flow_user'
    });
    console.log('   我的预约:', myBookingsRes.data.code === 0 ? '成功' : '失败', myBookingsRes.data);
    
    // 5. 取消预约
    if (bookingId) {
      console.log(`\n5. 取消预约 (ID: ${bookingId})...`);
      const cancelRes = await request('DELETE', `/api/booking/${bookingId}`, null, {
        'x-openid': 'test_flow_user'
      });
      console.log('   预约取消:', cancelRes.data.code === 0 ? '成功' : '失败', cancelRes.data);
    }
    
    // 6. 再次获取我的预约（验证已删除）
    console.log('\n6. 再次获取我的预约（验证已删除）...');
    const finalBookingsRes = await request('GET', '/api/my-bookings', null, {
      'x-openid': 'test_flow_user'
    });
    console.log('   剩余预约数:', finalBookingsRes.data.data?.length || 0);
    
    // 清理
    console.log('\n7. 清理测试数据...');
    await request('DELETE', '/api/admin/table/bookings', null, {
      'x-openid': 'system_super_admin'
    });
    await request('DELETE', '/api/admin/table/users', null, {
      'x-openid': 'system_super_admin'
    });
    console.log('   清理完成');
    
    console.log('\n=== 测试流程完成 ===');
  } catch (error) {
    console.error('测试出错:', error.message);
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
  await runTest();
  process.exit(0);
}

main();
