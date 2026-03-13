const { Prescription } = require('../db');

// 生成随机 ID
const generateId = () => Math.random().toString(36).substr(2, 9);

// 处方 OCR 识别
async function handlePrescriptionOCR(image, openid) {
  if (!image) {
    throw new Error("缺少图片数据");
  }

  // 提取文件名
  const fileName = image.split('/').pop();
  console.log('========================================');
  console.log('收到处方 OCR 请求');
  console.log('  请求时间:', new Date().toISOString());
  console.log('  openid:', openid || '未提供');
  console.log('  文件 ID:', image);
  console.log('  文件名称:', fileName);
  console.log('========================================');

  console.log('开始处理 OCR 识别...');
  const mockResult = `处方单\n\n姓名：张三\n性别：男\n年龄：35岁\n\n【诊断】\n脾胃虚弱\n\n【处方】\n1. 白术 15g\n2. 茯苓 15g\n3. 陈皮 10g\n4. 半夏 10g\n5. 甘草 6g\n\n【用法】\n水煎服，每日一剂，分早晚两次服用。\n\n【注意事项】\n忌食生冷辛辣食物，注意保暖。`;

  const prescriptionId = generateId();

  console.log('OCR 识别成功，返回结果');
  console.log('========================================');

  return {
    code: 0,
    data: {
      prescriptionId,
      text: mockResult,
    },
  };
}

// 获取处方历史
async function getPrescriptionHistory(openid) {
  if (!openid) {
    throw new Error("缺少用户标识");
  }

  const prescriptions = await Prescription.findAll({
    where: { openid },
    order: [["createTime", "DESC"]],
  });

  const prescriptionList = prescriptions.map((p) => ({
    prescriptionId: p.prescriptionId,
    image: p.image,
    text: p.text,
    createTime: p.createTime,
  }));

  return { code: 0, data: prescriptionList };
}

module.exports = {
  handlePrescriptionOCR,
  getPrescriptionHistory,
};