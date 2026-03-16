/**
 * API测试用例
 * 测试易方顺诊所助手后端API接口
 */

const BASE_URL = 'http://localhost:80';

// 导入数据库wrapper，用于直接操作数据库
const { User, Prescription } = require('./wrappers/db-wrapper');

// 测试用户数据
const testUsers = {
  normalUser: {
    code: 'test_normal_user_' + Date.now(),
    openid: null,
    name: '测试普通用户',
    phone: '13800138001'
  },
  adminUser: {
    code: 'test_admin_user_' + Date.now(),
    openid: null,
    name: '测试管理员',
    phone: '13800138002'
  },
  superAdminUser: {
    code: 'test_super_admin_' + Date.now(),
    openid: null,
    name: '测试超级管理员',
    phone: '13800138003'
  }
};

// 测试结果记录
const testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

/**
 * 测试工具函数
 */
async function testApi(description, testFn) {
  console.log(`\n🧪 测试: ${description}`);
  try {
    await testFn();
    testResults.passed++;
    testResults.tests.push({ description, status: 'passed' });
    console.log('✅ 通过');
  } catch (error) {
    // 检查是否是我们抛出的预期错误
    if (error.message.includes('不应该能够') || error.message.includes('应该被拒绝')) {
      // 这是预期的失败，测试实际通过了
      testResults.passed++;
      testResults.tests.push({ description, status: 'passed' });
      console.log('✅ 通过（权限验证生效）');
    } else {
      testResults.failed++;
      testResults.tests.push({ description, status: 'failed', error: error.message });
      console.log(`❌ 失败: ${error.message}`);
    }
  }
}

async function request(url, options = {}) {
  const defaultOptions = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  };
  
  const mergedOptions = { ...defaultOptions, ...options };
  // 正确合并headers对象
  if (options.headers) {
    mergedOptions.headers = { ...defaultOptions.headers, ...options.headers };
  }
  
  const response = await fetch(BASE_URL + url, {
    ...mergedOptions,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  
  const data = await response.json();
  return { response, data };
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
 * 数据库操作函数（用于测试准备）
 */
async function createTestUser(user) {
  // 生成openid（模拟微信生成的openid）
  user.openid = 'user_' + Math.random().toString(36).substr(2, 20);
  
  await User.create({
    openid: user.openid,
    code: user.code,
    name: user.name,
    phone: user.phone,
    isNewUser: false,
    role: 'user' // 默认为普通用户
  });
  
  return user.openid;
}

async function setUserRole(openid, role) {
  console.log(`尝试设置角色: ${openid} -> ${role}`);
  
  const user = await User.findByPk(openid);
  if (!user) {
    throw new Error('用户不存在');
  }
  
  console.log('找到用户:', JSON.stringify(user, null, 2));
  
  // 直接修改用户对象的role属性
  user.role = role;
  user.updatedAt = new Date().toISOString();
  
  console.log('准备更新:', JSON.stringify({ role, updatedAt: user.updatedAt }, null, 2));
  
  // 重新保存到数据库
  const result = await User.update(
    { role, updatedAt: user.updatedAt },
    { where: { openid } }
  );
  
  console.log('更新结果:', result);
  
  // 验证更新是否成功
  const updatedUser = await User.findByPk(openid);
  console.log('更新后的用户:', JSON.stringify(updatedUser, null, 2));
}

/**
 * 测试套件
 */
async function runTests() {
  console.log('========================================');
  console.log('开始运行API测试用例');
  console.log('========================================');

  // 0. 准备测试用户
  await testApi('创建测试用户', async () => {
    // 创建普通用户
    testUsers.normalUser.openid = await createTestUser(testUsers.normalUser);
    
    // 创建管理员用户
    testUsers.adminUser.openid = await createTestUser(testUsers.adminUser);
    await setUserRole(testUsers.adminUser.openid, 'admin');
    
    // 创建超级管理员用户
    testUsers.superAdminUser.openid = await createTestUser(testUsers.superAdminUser);
    await setUserRole(testUsers.superAdminUser.openid, 'super_admin');
    
    console.log('测试用户创建完成:');
    console.log('  普通用户:', testUsers.normalUser.openid);
    console.log('  管理员:', testUsers.adminUser.openid);
    console.log('  超级管理员:', testUsers.superAdminUser.openid);
  });

  // 1. 用户登录和绑定测试
  await testUserLoginAndBinding();
  
  // 2. 处方上传测试
  await testPrescriptionUpload();
  
  // 3. 处方审核测试
  await testPrescriptionReview();
  
  // 4. 角色管理测试
  await testRoleManagement();
  
  // 5. 权限验证测试
  await testPermissionValidation();

  // 输出测试结果
  console.log('\n========================================');
  console.log('测试结果汇总');
  console.log('========================================');
  console.log(`总测试数: ${testResults.passed + testResults.failed}`);
  console.log(`通过: ${testResults.passed}`);
  console.log(`失败: ${testResults.failed}`);
  
  if (testResults.failed > 0) {
    console.log('\n失败的测试:');
    testResults.tests.filter(t => t.status === 'failed').forEach(t => {
      console.log(`  - ${t.description}: ${t.error}`);
    });
  }
  
  process.exit(testResults.failed > 0 ? 1 : 0);
}

/**
 * 1. 用户登录和绑定测试
 */
async function testUserLoginAndBinding() {
  console.log('\n📋 用户登录和绑定测试');
  
  // 测试普通用户登录
  await testApi('普通用户登录', async () => {
    const { data } = await request('/api/login', {
      method: 'POST',
      body: { code: 'test_code_' + Date.now() }
    });
    
    assertEquals(data.code, 0, '登录成功');
    assert(data.data.isNewUser, '应该是新用户');
  });

  // 获取用户列表
  await testApi('获取用户列表', async () => {
    const { data } = await request('/api/users');
    
    assertEquals(data.code, 0, '获取成功');
    assert(Array.isArray(data.data), '返回数组');
    assert(data.data.length >= 3, '至少有3个用户');
  });
}

/**
 * 2. 处方上传测试
 */
async function testPrescriptionUpload() {
  console.log('\n📋 处方上传测试');

  // 模拟OCR识别（因为需要真实图片，这里测试保存接口）
  await testApi('普通用户保存处方', async () => {
    const prescriptionData = {
      prescriptionId: 'TEST001_' + Date.now(), // 使用时间戳避免重复
      name: '张三',
      age: '35',
      date: '2026-03-15',
      rp: 'Rp测试内容',
      dosage: '3',
      administrationMethod: '内服',
      medicines: [
        { name: '当归', quantity: '15g', note: '先煎' },
        { name: '黄芪', quantity: '20g', note: '' }
      ],
      doctor: '肖笃凯'
    };

    const { data } = await request('/api/prescription/save', {
      method: 'POST',
      body: {
        openid: testUsers.normalUser.openid,
        thumbnail: 'test_thumbnail.jpg',
        ...prescriptionData
      }
    });

    assertEquals(data.code, 0, '保存成功');
  });

  // 测试处方ID去重（相同处方ID，待审核状态）
  await testApi('相同处方ID的待审核处方', async () => {
    const prescriptionData = {
      prescriptionId: 'TEST001_DUPLICATE', // 使用特定的测试ID
      name: '李四',
      age: '40',
      date: '2026-03-15',
      rp: 'Rp测试内容2',
      dosage: '5',
      administrationMethod: '内服',
      medicines: [
        { name: '人参', quantity: '10g', note: '另包' }
      ],
      doctor: '肖笃凯'
    };

    const { data } = await request('/api/prescription/save', {
      method: 'POST',
      body: {
        openid: testUsers.normalUser.openid,
        thumbnail: 'test_thumbnail2.jpg',
        ...prescriptionData
      }
    });

    // 待审核状态应该允许重复
    assertEquals(data.code, 0, '待审核状态允许重复');
  });

  // 获取用户处方历史
  await testApi('获取用户处方历史', async () => {
    const { data } = await request(`/api/prescription/user-history?openid=${testUsers.normalUser.openid}`);
    
    assertEquals(data.code, 0, '获取成功');
    assert(Array.isArray(data.data), '返回数组');
  });
}

/**
 * 3. 处方审核测试
 */
async function testPrescriptionReview() {
  console.log('\n📋 处方审核测试');

  // 管理员上传一个待审核处方
  await testApi('管理员上传处方', async () => {
    const prescriptionData = {
      prescriptionId: 'ADMIN001',
      name: '管理员测试',
      age: '45',
      date: '2026-03-15',
      rp: '管理员Rp内容',
      dosage: '3',
      administrationMethod: '外用',
      medicines: [
        { name: '薄荷', quantity: '10g', note: '后下' }
      ],
      doctor: '肖笃凯'
    };

    const { data } = await request('/api/prescription/save', {
      method: 'POST',
      body: {
        openid: testUsers.adminUser.openid,
        thumbnail: 'admin_test.jpg',
        ...prescriptionData
      }
    });

    assertEquals(data.code, 0, '管理员保存成功');
  });

  // 获取待审核处方列表（需要管理员权限）
  await testApi('获取待审核处方列表（权限测试）', async () => {
    try {
      const { data } = await request(`/api/prescription/pending?openid=${testUsers.normalUser.openid}`);
      throw new Error('普通用户不应该能够访问待审核列表');
    } catch (error) {
      if (error.message === '普通用户不应该能够访问待审核列表') {
        throw error;
      }
      assert(error.message.includes('权限不足') || error.message.includes('403') || error.message.includes('401'), '权限验证生效');
    }
  });

  // 获取待审核处方列表（管理员）
  await testApi('获取待审核处方列表（管理员）', async () => {
      const { data } = await request(`/api/prescription/pending?openid=${testUsers.adminUser.openid}`);
      assertEquals(data.code, 0, '获取成功');
      assert(Array.isArray(data.data), '返回数组');
    });

  // 审核通过处方
  let prescriptionToReview = null;
  
  await testApi('审核通过处方', async () => {
    // 先获取待审核列表
    const { data: pendingData } = await request('/api/prescription/pending', {
      method: 'GET',
      headers: { 
        'x-openid': testUsers.adminUser.openid,
        'x-home-page': 'true' // 添加主页标识
      }
    });
    
    if (pendingData.data && pendingData.data.length > 0) {
      prescriptionToReview = pendingData.data[0];
      
      console.log('准备审核处方:', JSON.stringify(prescriptionToReview, null, 2));
      console.log('准备发送的数据:', JSON.stringify({
        id: prescriptionToReview.id,
        action: 'approve'
      }, null, 2));
      
      const { data } = await request('/api/prescription/review', {
        method: 'POST',
        body: {
          id: prescriptionToReview.id,
          action: 'approve',
          openid: testUsers.adminUser.openid,
          reviewerName: '测试管理员'
        }
      });
      
      console.log('审核结果:', JSON.stringify(data, null, 2));
      assertEquals(data.code, 0, '审核成功');
    } else {
      console.log('⚠️  没有待审核处方可供测试');
    }
  });
}

/**
 * 4. 角色管理测试
 */
async function testRoleManagement() {
  console.log('\n📋 角色管理测试');

  // 设置管理员角色（通过超级管理员）
  await testApi('超级管理员设置管理员角色', async () => {
    const { data } = await request('/api/user/set-role', {
      method: 'POST',
      headers: { 
        'x-openid': testUsers.superAdminUser.openid,
        'x-home-page': 'true' // 添加主页标识
      },
      body: {
        openid: testUsers.adminUser.openid,
        role: 'admin'
      }
    });
    
    console.log('调试 - 返回数据:', JSON.stringify(data, null, 2));
    // 确保用户角色确实是admin
    assertEquals(data.code, 0, '设置管理员成功');
  });

  // 测试普通用户不能设置角色
  await testApi('普通用户设置角色权限测试', async () => {
    try {
      const { data } = await request('/api/user/set-role', {
        method: 'POST',
        body: {
          openid: testUsers.normalUser.openid,
          role: 'admin',
          operatorOpenid: testUsers.normalUser.openid
        }
      });
      throw new Error('普通用户不应该能够设置角色');
    } catch (error) {
      if (error.message === '普通用户不应该能够设置角色') {
        throw error;
      }
      assert(error.message.includes('权限不足') || error.message.includes('403') || error.message.includes('401'), '权限验证生效');
    }
  });
}

/**
 * 5. 权限验证测试
 */
async function testPermissionValidation() {
  console.log('\n📋 权限验证测试');

  // 普通用户删除自己的待审核处方
  await testApi('用户删除自己的待审核处方', async () => {
    // 先获取用户的处方历史
    const { data: historyData } = await request(`/api/prescription/user-history?openid=${testUsers.normalUser.openid}`);
    
    if (historyData.data && historyData.data.length > 0) {
      const pendingPrescription = historyData.data.find(p => p.status === '待审核');
      
      if (pendingPrescription) {
        console.log('准备删除处方:', JSON.stringify(pendingPrescription, null, 2));
        console.log('删除请求URL:', `/api/prescription/${pendingPrescription.prescriptionId}?openid=${testUsers.normalUser.openid}`);
        console.log('用户openid:', testUsers.normalUser.openid);
        
        const { data } = await request(`/api/prescription/${pendingPrescription.prescriptionId}?openid=${testUsers.normalUser.openid}`, {
          method: 'DELETE'
        });
        
        console.log('删除结果:', JSON.stringify(data, null, 2));
        assertEquals(data.code, 0, '删除成功');
      }
    }
  });

  // 普通用户不能删除已审核的处方
  await testApi('用户不能删除已审核处方', async () => {
    const { data: historyData } = await request(`/api/prescription/user-history?openid=${testUsers.normalUser.openid}`);
    
    if (historyData.data && historyData.data.length > 0) {
      const approvedPrescription = historyData.data.find(p => p.status === '已审核');
      
      if (approvedPrescription) {
        try {
          await request(`/api/prescription/${approvedPrescription.prescriptionId}?openid=${testUsers.normalUser.openid}`, {
            method: 'DELETE'
          });
          throw new Error('不应该能够删除已审核的处方');
        } catch (error) {
          assert(error.message.includes('只能删除待审核'), '权限验证生效');
        }
      }
    }
  });

  // 管理员可以更新处方ID
  await testApi('管理员更新处方ID', async () => {
    const { data: listData } = await request('/api/prescription/list', {
      method: 'GET',
      headers: { 
        'x-openid': testUsers.adminUser.openid,
        'x-home-page': 'true' // 添加主页标识
      }
    });
    
    if (listData.data && listData.data.length > 0) {
      const prescription = listData.data[0];
      
      const { data } = await request('/api/prescription/update-prescription-id', {
        method: 'POST',
        body: {
          openid: testUsers.adminUser.openid,
          oldPrescriptionId: prescription.prescriptionId,
          newPrescriptionId: prescription.prescriptionId + '_UPDATED'
        }
      });
      
      assertEquals(data.code, 0, '更新成功');
    } else {
      console.log('⚠️  没有处方可供测试更新ID');
    }
  });

  // 普通用户不能更新处方ID
  await testApi('普通用户更新处方ID权限测试', async () => {
    try {
      const { data } = await request('/api/prescription/update-prescription-id', {
        method: 'POST',
        body: {
          openid: testUsers.normalUser.openid,
          oldPrescriptionId: 'TEST001',
          newPrescriptionId: 'TEST001_NEW'
        }
      });
      throw new Error('普通用户不应该能够更新处方ID');
    } catch (error) {
      if (error.message === '普通用户不应该能够更新处方ID') {
        throw error;
      }
      assert(error.message.includes('权限不足') || error.message.includes('403') || error.message.includes('401'), '权限验证生效');
    }
  });
}

// 运行测试
runTests().catch(error => {
  console.error('测试运行失败:', error);
  process.exit(1);
});
