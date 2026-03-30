const http = require('http');
const assert = require('assert');
const { User } = require('../../wrappers/db-wrapper');

const BASE_URL = 'http://localhost:80';

// 测试结果统计
let testStats = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: []
};

/**
 * HTTP 请求工具函数
 */
function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 80,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ 
            statusCode: res.statusCode, 
            data: JSON.parse(data) 
          });
        } catch (e) {
          resolve({ 
            statusCode: res.statusCode, 
            data: data 
          });
        }
      });
    });
    
    req.on('error', reject);
    
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
  console.log(`\n🧪 测试：${name}`);
  
  try {
    await testFn();
    testStats.passed++;
    console.log('✅ 通过');
  } catch (error) {
    testStats.failed++;
    testStats.errors.push({ name, error: error.message || String(error) });
    console.log(`❌ 失败：${error.message || String(error)}`);
    if (error.stack) {
      console.log(`   堆栈：${error.stack.split('\n')[1]}`);
    }
  }
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `期望 ${expected}，实际得到 ${actual}`);
  }
}

// 执行测试并导出
async function runHomeLoginTests() {
  console.log('\n📋 首页登录测试');
  console.log('=' .repeat(50));
  
  // 测试 1: 默认超级管理员登录
  await test('POST /api/home-login - 默认超级管理员登录', async () => {
    const result = await request('POST', '/api/home-login', {
      phone: 'home_super_admin'
    });
    
    assertEquals(result.statusCode, 200, '请求成功');
    assertEquals(result.data.code, 0, '登录成功');
    assertEquals(result.data.data.phone, 'home_super_admin', '返回手机号');
    assertEquals(result.data.data.role, 'super_admin', '返回角色');
    assertEquals(result.data.data.isHomeAdmin, true, '标识为首页管理员');
    console.log('  默认超级管理员登录成功');
  });
  
  // 测试 2: 未注册手机号登录
  await test('POST /api/home-login - 未注册手机号', async () => {
    const result = await request('POST', '/api/home-login', {
      phone: '13800138000'
    });
    
    assertEquals(result.statusCode, 404, '返回 404');
    assertEquals(result.data.code, 1, '返回错误码');
    assert(result.data.message.includes('未注册'), '提示未注册');
    console.log('  未注册手机号返回正确错误');
  });
  
  // 测试 3: 缺少手机号参数
  await test('POST /api/home-login - 缺少手机号参数', async () => {
    const result = await request('POST', '/api/home-login', {});
    
    assertEquals(result.statusCode, 400, '返回 400');
    assertEquals(result.data.code, 1, '返回错误码');
    assert(result.data.message.includes('缺少手机号'), '提示缺少手机号');
    console.log('  缺少手机号参数返回正确错误');
  });
  
  // 测试 4: 使用默认超管访问需要权限的 API
  await test('GET /api/prescription/list - 默认超管访问', async () => {
    const result = await request('GET', '/api/prescription/list', null, {
      'x-phone': 'home_super_admin'
    });
    
    assertEquals(result.statusCode, 200, '应返回 200 成功');
    assertEquals(result.data.code, 0, '应返回成功码');
    console.log('  默认超管成功访问处方列表');
  });
  
  // 测试 5: 使用默认超管设置用户角色
  await test('POST /api/user/set-role - 默认超管设置角色', async () => {
    // 直接在数据库创建测试用户
    const testOpenid = 'test_home_login_' + Date.now();
    const testPhone = '138' + Date.now();
    await User.create({
      openid: testOpenid,
      name: '测试用户',
      phone: testPhone,
      role: 'user',
      isNewUser: false
    });

    const result = await request('POST', '/api/user/set-role', {
      openid: testOpenid,
      role: 'admin'
    }, {
      'x-phone': 'home_super_admin'
    });

    assertEquals(result.statusCode, 200, '应返回 200 成功');
    assertEquals(result.data.code, 0, '应返回成功码');
    console.log('  默认超管成功设置用户角色');
  });

  // 测试 6: 普通用户禁止登录主页
  await test('POST /api/home-login - 普通用户禁止登录', async () => {
    // 直接在数据库创建普通用户
    const testOpenid = 'test_home_user_' + Date.now();
    const testPhone = '139' + Date.now();
    await User.create({
      openid: testOpenid,
      name: '普通用户',
      phone: testPhone,
      role: 'user',
      isNewUser: false
    });

    // 尝试用普通用户登录
    const loginResult = await request('POST', '/api/home-login', {
      phone: testPhone
    });

    assertEquals(loginResult.statusCode, 403, '应返回 403 禁止访问');
    assertEquals(loginResult.data.code, 1, '应返回错误码');
    assert(loginResult.data.message.includes('禁止') || loginResult.data.message.includes('普通用户'), '提示普通用户禁止登录');
    console.log('  普通用户登录被拒绝');
  });
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 首页登录测试结果');
  console.log('='.repeat(50));
  console.log(`总测试数：${testStats.total}`);
  console.log(`通过：${testStats.passed} ✅`);
  console.log(`失败：${testStats.failed} ❌`);
  console.log('='.repeat(50));
  
  return testStats.failed === 0;
}

function getTestStats() {
  return testStats;
}

module.exports = {
  runHomeLoginTests,
  getTestStats
};

// 如果是直接运行此文件
if (require.main === module) {
  (async () => {
    try {
      const success = await runHomeLoginTests();
      process.exit(success ? 0 : 1);
    } catch (error) {
      console.error('测试执行出错:', error);
      process.exit(1);
    }
  })();
}
