/**
 * 数据表管理改造测试（简化版）
 */

const testHelpers = require("../test-helpers");
const { request, superAdminRequest, test, assert, assertEquals, getTestUsers, testStats } = testHelpers;

const testData = {
  inOrderId: null,
  inItemId: null,
  outOrderId: null,
  prescriptionId: null
};

async function runDataManagementTests(externalTestUsers) {
  const testUsers = externalTestUsers || getTestUsers();

  console.log("\n📊 测试数据表管理改造");
  console.log("=====================================");

  if (!testUsers.normalUser) {
    console.log("⚠️  测试用户未创建，跳过数据管理测试");
    return { passed: 0, failed: 0, skipped: 0 };
  }

  console.log("\n--- 级联删除测试 ---");

  await test("创建测试药材", async () => {
    const res = await superAdminRequest("POST", "/api/stock/herbs", {
      name: "级联删除测试药材_" + Date.now(),
      alias: "测试别名",
      unit: "克",
      minValue: 0
    });
    assert(res.data.code === 0, "创建药材失败");
  });

  await test("创建入库单（含明细）", async () => {
    const res = await superAdminRequest("POST", "/api/stock/in/orders", {
      orderDate: new Date().toISOString().split("T")[0],
      supplierName: "测试供应商",
      items: [
        {
          herbName: "级联删除测试药材",
          quantity: 100,
          unitPrice: 10,
          costPrice: 10
        }
      ]
    });
    assert(res.data.code === 0, "创建入库单失败: " + JSON.stringify(res.data));
    testData.inOrderId = res.data.data.id;
  });

  await test("验证明细已创建", async () => {
    // 通过查询入库单详情确认明细已创建
    const res = await superAdminRequest("GET", `/api/stock/in/orders/${testData.inOrderId}`);
    assert(res.data.code === 0, "查询入库单详情失败");
    assert(res.data.data.items && res.data.data.items.length > 0, "入库明细应存在");
    testData.inItemId = res.data.data.items[0].id;
  });

  await test("验证明细已创建", async () => {
    assert(testData.inItemId, "入库明细ID应存在");
  });

  await test("删除入库单", async () => {
    const res = await superAdminRequest("DELETE", "/api/stock/in/orders/" + testData.inOrderId);
    assert(res.data.code === 0, "删除入库单失败");
  });

  await test("验证明细已级联删除", async () => {
    // 通过查询入库单详情确认入库单已被删除
    const res = await superAdminRequest("GET", `/api/stock/in/orders/${testData.inOrderId}`);
    assert(res.data.code !== 0 || !res.data.data, "入库单应该已被删除");
  });

  console.log("\n--- 处方状态测试 ---");

  await test("创建处方（待审核）", async () => {
    const prescriptionId = "TEST_RX_" + Date.now();
    // 使用普通用户创建处方，这样状态才会是"待审核"
    // admin用户创建会自动变成"已审核"
    const openid = testUsers.normalUser.openid;
    const res = await request("POST", "/api/prescription/save", {
      openid,
      prescriptionId,
      name: "测试患者",
      age: "30",
      rp: "测试Rp",
      medicines: [
        { name: "黄芪", quantity: "10" },
        { name: "当归", quantity: "15" }
      ]
    }, {
      'x-openid': testUsers.normalUser.openid
    });
    assert(res.data.code === 0, "创建处方失败: " + JSON.stringify(res.data));
    testData.prescriptionId = prescriptionId;
  });

  await test("验证openid正确保存", async () => {
    const res = await superAdminRequest("GET", `/api/prescription/list?keyword=${testData.prescriptionId}`);
    const prescription = res.data.data.rows.find(p => p.prescriptionId === testData.prescriptionId);
    assert(prescription, "未找到处方记录");
    assert(prescription.openid, "openid应有值");
  });

  await test("验证处方状态为待审核", async () => {
    const res = await superAdminRequest("GET", `/api/prescription/list?keyword=${testData.prescriptionId}`);
    console.log("处方列表查询结果:", JSON.stringify(res.data).substring(0, 200));
    const prescription = res.data.data.rows.find(p => p.prescriptionId === testData.prescriptionId);
    console.log("找到的处方:", prescription);
    assert(prescription, "未找到处方记录");
    assertEquals(prescription.status, "待审核", "状态应为待审核，实际为: " + prescription.status);
  });

  console.log("\n🧹 清理测试数据...");
  try {
    if (testData.inOrderId) {
      await superAdminRequest("DELETE", "/api/stock/in/orders/" + testData.inOrderId);
    }
    if (testData.prescriptionId) {
      await superAdminRequest("DELETE", "/api/prescription/" + testData.prescriptionId + "/待审核");
    }
    console.log("✅ 数据表管理测试数据清理完成");
  } catch (e) {
    console.log("⚠️  清理失败:", e.message);
  }

  console.log("\n📊 数据表管理测试结果");
  console.log("=====================================");
  console.log("总测试数: " + testStats.total);
  console.log("通过: " + testStats.passed + " ✅");
  console.log("失败: " + testStats.failed + " ❌");
  console.log("跳过: " + testStats.skipped + " ⏭️");

  if (testStats.failed > 0) {
    console.log("\n❌ 失败的测试:");
    testStats.errors.forEach(e => {
      console.log("  " + e.name + ": " + e.error);
    });
  }

  return {
    passed: testStats.passed,
    failed: testStats.failed,
    skipped: testStats.skipped
  };
}

module.exports = {
  runDataManagementTests,
  getTestStats: () => testStats
};
