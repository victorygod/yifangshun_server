const fetch = require('node-fetch');
const BASE_URL = 'http://localhost:3000';

async function request(url, options = {}) {
  const defaultOptions = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  const mergedOptions = { ...defaultOptions, ...options };
  if (options.headers) {
    mergedOptions.headers = { ...defaultOptions.headers, ...options.headers };
  }

  console.log(`发送请求: ${mergedOptions.method} ${BASE_URL}${url}`);
  console.log(`请求头:`, mergedOptions.headers);

  const response = await fetch(BASE_URL + url, {
    ...mergedOptions,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  console.log(`响应状态: ${response.status}`);

  const data = await response.json();
  console.log(`响应数据:`, data);

  return { response, data };
}

async function testPendingPrescriptionAPI() {
  console.log('========================================');
  console.log('测试获取待审核处方列表API');
  console.log('========================================\n');

  // 创建测试用户
  console.log('1. 创建测试用户...');
  const normalUser = {
    openid: 'test_normal_user_' + Date.now(),
    name: '测试普通用户',
    phone: '13900000000',
    role: 'user'
  };

  const { data: userData } = await request('/api/user', {
    method: 'POST',
    body: normalUser
  });

  console.log('用户创建结果:', userData);
  console.log('');

  // 测试1: 使用普通用户openid获取待审核列表
  console.log('2. 测试普通用户访问待审核列表...');
  try {
    const { data: pendingData } = await request(`/api/prescription/pending?openid=${normalUser.openid}`);
    console.log('✅ 请求成功（不应该成功）');
    console.log('返回数据:', pendingData);
  } catch (error) {
    console.log('❌ 请求失败（符合预期）');
    console.log('错误信息:', error.message);
  }
  console.log('');

  // 测试2: 使用管理员openid获取待审核列表
  console.log('3. 创建管理员用户...');
  const adminUser = {
    openid: 'test_admin_user_' + Date.now(),
    name: '测试管理员',
    phone: '13900000001',
    role: 'admin'
  };

  const { data: adminData } = await request('/api/user', {
    method: 'POST',
    body: adminUser
  });

  console.log('管理员创建结果:', adminData);
  console.log('');

  console.log('4. 测试管理员访问待审核列表...');
  try {
    const { data: pendingData } = await request(`/api/prescription/pending?openid=${adminUser.openid}`);
    console.log('✅ 请求成功（符合预期）');
    console.log('返回数据:', pendingData);
  } catch (error) {
    console.log('❌ 请求失败（不应该失败）');
    console.log('错误信息:', error.message);
  }
}

testPendingPrescriptionAPI().catch(error => {
  console.error('测试失败:', error);
  process.exit(1);
});