const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:80';
const DB_PATH = path.join(__dirname, 'wrappers/local-data');

// 导入数据库wrapper，用于直接操作数据库
const { User, Prescription } = require('./wrappers/db-wrapper');

// 读取数据库文件
function readDbFile(filename) {
  const filePath = path.join(DB_PATH, filename);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// 写入数据库文件
function writeDbFile(filename, data) {
  const filePath = path.join(DB_PATH, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// 发送请求
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

  const response = await global.fetch(BASE_URL + url, {
    ...mergedOptions,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await response.json();
  return { response, data };
}

// 测试清理过期处方功能
async function testCleanupExpiredPrescriptions() {
  console.log('========================================');
  console.log('测试清理过期处方功能');
  console.log('========================================\n');

  // 1. 清理数据库
  console.log('1. 清理数据库...');
  writeDbFile('users.json', []);
  writeDbFile('prescriptions.json', []);
  writeDbFile('bookings.json', []);
  console.log('✅ 数据库清理完成\n');

  // 2. 创建测试用户（管理员）
  console.log('2. 创建测试用户（管理员）...');
  const adminUser = {
    code: 'test_cleanup_admin_' + Date.now(),
    name: '清理测试管理员',
    phone: '13900000000',
    openid: null
  };

  // 使用数据库模型直接创建用户
  adminUser.openid = 'user_' + Math.random().toString(36).substr(2, 20);
  await User.create({
    openid: adminUser.openid,
    code: adminUser.code,
    name: adminUser.name,
    phone: adminUser.phone,
    isNewUser: false,
    role: 'admin'
  });

  console.log(`✅ 管理员创建完成 (openid: ${adminUser.openid})\n`);

  // 3. 创建过期的待审核处方（超过7天）
  console.log('3. 创建过期的待审核处方...');
  const eightDaysAgo = new Date();
  eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);

  const expiredPrescriptions = [];
  for (let i = 1; i <= 3; i++) {
    const prescription = {
      id: `EXPIRED_${i}_${Date.now()}`,
      prescriptionId: `EXPIRED_${i}`,
      openid: adminUser.openid,
      status: '待审核',
      thumbnail: `cloud://test-env-${Date.now()}/expired_thumb_${i}.jpg`,
      data: JSON.stringify({
        name: `过期处方${i}`,
        age: '30',
        date: '2026-03-15',
        rp: 'Rp测试内容',
        medicines: [
          { name: '当归', quantity: '10g' }
        ],
        doctor: '测试医师'
      }),
      createTime: eightDaysAgo.toISOString(),
      updatedAt: eightDaysAgo.toISOString()
    };
    expiredPrescriptions.push(prescription);
  }

  const prescriptions = readDbFile('prescriptions.json');
  prescriptions.push(...expiredPrescriptions);
  writeDbFile('prescriptions.json', prescriptions);
  console.log(`✅ 创建了 ${expiredPrescriptions.length} 个过期处方\n`);

  // 4. 创建正常的待审核处方（未过期）
  console.log('4. 创建正常的待审核处方...');
  const today = new Date();
  const normalPrescription = {
    id: `NORMAL_${Date.now()}`,
    prescriptionId: 'NORMAL_1',
    openid: adminUser.openid,
    status: '待审核',
    thumbnail: `cloud://test-env-${Date.now()}/normal_thumb.jpg`,
    data: JSON.stringify({
      name: '正常处方',
      age: '30',
      date: '2026-03-15',
      rp: 'Rp测试内容',
      medicines: [
        { name: '当归', quantity: '10g' }
      ],
      doctor: '测试医师'
    }),
    createTime: today.toISOString(),
    updatedAt: today.toISOString()
  };

  const prescriptionsAfterExpired = readDbFile('prescriptions.json');
  prescriptionsAfterExpired.push(normalPrescription);
  writeDbFile('prescriptions.json', prescriptionsAfterExpired);
  console.log('✅ 创建了 1 个正常处方\n');

  // 5. 获取待审核列表，触发清理
  console.log('5. 获取待审核列表（触发清理）...');
  const { data: pendingData } = await request(`/api/prescription/pending?openid=${adminUser.openid}`);
  console.log('返回数据:', JSON.stringify(pendingData, null, 2));

  // 6. 验证清理结果
  console.log('\n6. 验证清理结果...');

  // 检查返回的清理信息
  if (pendingData.cleaned) {
    console.log(`✅ 清理信息返回正确:`);
    console.log(`   - 删除处方数: ${pendingData.cleaned.count}`);
    console.log(`   - 需要清理的缩略图数: ${pendingData.cleaned.thumbnails.length}`);
    console.log(`   - 缩略图列表:`, pendingData.cleaned.thumbnails);

    // 验证缩略图数量
    if (pendingData.cleaned.thumbnails.length === 3) {
      console.log('✅ 缩略图数量正确 (3个)');
    } else {
      console.log(`❌ 缩略图数量错误，期望 3 个，实际 ${pendingData.cleaned.thumbnails.length} 个`);
    }
  } else {
    console.log('❌ 清理信息未返回');
  }

  // 检查数据库中的处方
  const currentPrescriptions = readDbFile('prescriptions.json');
  console.log(`\n当前数据库中的处方数: ${currentPrescriptions.length}`);

  const expiredCount = currentPrescriptions.filter(p => p.prescriptionId.startsWith('EXPIRED')).length;
  const normalCount = currentPrescriptions.filter(p => p.prescriptionId === 'NORMAL_1').length;

  console.log(`过期处方剩余: ${expiredCount} 个 (应该为 0)`);
  console.log(`正常处方剩余: ${normalCount} 个 (应该为 1)`);

  if (expiredCount === 0 && normalCount === 1) {
    console.log('✅ 处方清理结果正确');
  } else {
    console.log('❌ 处方清理结果错误');
  }

  // 7. 测试多次清理（应该是幂等的）
  console.log('\n7. 测试多次清理（幂等性）...');
  const { data: pendingData2 } = await request(`/api/prescription/pending?openid=${adminUser.openid}`);

  if (pendingData2.cleaned && pendingData2.cleaned.count === 0) {
    console.log('✅ 多次清理是幂等的，没有重复删除');
  } else {
    console.log('❌ 多次清理不是幂等的');
  }

  console.log('\n========================================');
  console.log('清理测试完成');
  console.log('========================================');
}

// 运行测试
testCleanupExpiredPrescriptions().catch(error => {
  console.error('测试失败:', error);
  process.exit(1);
});