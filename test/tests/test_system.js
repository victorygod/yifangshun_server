/**
 * 系统接口测试
 */

const BASE_URL = process.env.CLOUD_TEST_URL || 'http://localhost:80';

// 测试统计
const testStats = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  errors: []
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
  console.log('✅ 系统测试数据清理完成');
}

/**
 * 导出函数
 */
async function runSystemTests(testUsers) {
  console.log('\n📋 5. 测试系统接口');
  
  // GET /health
  await test('GET /health - 健康检查', async () => {
    const { response, data } = await request('GET', '/health');
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.status, 'ok', '服务器运行正常');
  });
  
  // POST /api/log
  await test('POST /api/log - 接收前端日志', async () => {
    const { response, data } = await request('POST', '/api/log', {
      timestamp: new Date().toISOString(),
      level: 'info',
      tag: 'test',
      message: '测试日志',
      data: { key: 'value' }
    });
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '日志接收成功');
  });
  
  // GET /api/home/users
  await test('GET /api/home/users - 获取首页用户列表', async () => {
    const { response, data } = await request('GET', '/api/home/users');
    
    assertEquals(response.statusCode, 200, '请求成功');
    assertEquals(data.code, 0, '返回成功');
    assert(Array.isArray(data.data.list), '返回数组');
  });
  
  console.log('\n📊 系统测试结果');
  console.log(`  总测试数: ${testStats.total}`);
  console.log(`  通过: ${testStats.passed} ✅`);
  console.log(`  失败: ${testStats.failed} ❌`);
}

// 导出模块
module.exports = {
  runSystemTests,
  cleanupTestData,
  getTestStats: () => testStats
};