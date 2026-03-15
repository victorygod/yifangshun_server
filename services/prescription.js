const { Prescription, Op } = require('../wrappers/db-wrapper');

// 生成随机 ID
const generateId = () => Math.random().toString(36).substr(2, 9);

// 将微信云存储 fileID 转换为 HTTPS URL
function convertCloudFileIdToUrl(fileId) {
  // fileID 格式: cloud://envID.zoneID/path/to/file
  // 转换为: https://zoneID.tcb.qcloud.la/path/to/file

  if (!fileId || !fileId.startsWith('cloud://')) {
    console.warn('不是有效的云存储 fileID:', fileId);
    return fileId;
  }

  // 去掉 cloud:// 前缀
  const withoutPrefix = fileId.substring(8);

  // 分割环境 ID 和 zoneID
  // 格式: envID.zoneID/path/to/file
  const lastDotIndex = withoutPrefix.indexOf('.');
  const firstSlashIndex = withoutPrefix.indexOf('/');

  if (lastDotIndex === -1 || firstSlashIndex === -1) {
    console.warn('fileID 格式不正确:', fileId);
    return fileId;
  }

  const envId = withoutPrefix.substring(0, lastDotIndex);
  const zoneId = withoutPrefix.substring(lastDotIndex + 1, firstSlashIndex);
  const filePath = withoutPrefix.substring(firstSlashIndex);

  // 构建 HTTPS URL
  const httpsUrl = `https://${zoneId}.tcb.qcloud.la${filePath}`;

  console.log('========================================');
  console.log('云存储 URL 转换');
  console.log('  原始 fileID:', fileId);
  console.log('  转换后 URL:', httpsUrl);
  console.log('========================================');

  return httpsUrl;
}

// 处方 OCR 识别
async function handlePrescriptionOCR(image, openid) {
  if (!image) {
    throw new Error("缺少图片数据");
  }

  let imageUrl = null;

  // 判断是云存储fileID还是base64数据
  if (image.startsWith('cloud://')) {
    // 云存储模式：转换为HTTPS URL
    imageUrl = convertCloudFileIdToUrl(image);
    console.log('云存储模式，图片URL:', imageUrl);
  } else {
    // 本地模式：image已经是base64数据
    console.log('本地模式，使用base64数据');
  }

  console.log('========================================');
  console.log('开始 OCR 识别');
  if (imageUrl) {
    console.log('  图片 URL:', imageUrl);
  } else {
    console.log('  图片格式: base64');
  }
  console.log('========================================');

  // 调用阿里云通义千问 VL 模型进行 OCR 识别
  const ocrPrompt = `识别中医处方，以json格式返回，遵循以下输出格式：
{
  '姓名': '',
  '年龄': '',
  '日期': '',
  '处方号': '右上角红色编号',
  '脉象': '',
  '舌像': '',
  '症状及诊断': '',
  'Rp': '完整的Rp内容',
  '剂数': '一般是中文繁体大写数字，输出时转为阿拉伯数字',
  '服用方式': '内服还是外用',
  '药方': [
    // Rp中每款中药以及数量，不是药名的内容不用写
    {
      '药名': '',
      '数量': '',
      '备注': ''  // 先煎、后下、打、另包等
    }
  ],
  '医师': ''
}`;

  try {
    const requestBody = {
      model: 'qwen-vl-max',
      messages: [
        {
          role: 'user',
          content: []
        }
      ]
    };

    // 根据图片格式构建请求内容
    if (imageUrl) {
      requestBody.messages[0].content.push({
        type: 'image_url',
        image_url: {
          url: imageUrl
        }
      });
    } else {
      requestBody.messages[0].content.push({
        type: 'image_url',
        image_url: {
          url: image
        }
      });
    }

    requestBody.messages[0].content.push({
      type: 'text',
      text: ocrPrompt
    });

    const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer sk-25ad83b975ba4458a9983367888dd0dd',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const result = await response.json();
    console.log('========================================');
    console.log('OCR 识别结果');
    console.log('  原始响应:', JSON.stringify(result, null, 2));
    console.log('========================================');

    if (result.choices && result.choices[0] && result.choices[0].message) {
      const content = result.choices[0].message.content;
      console.log('识别内容:', content);

      // 提取 JSON
      let jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("无法识别到处方ID，请重新上传");
      }

      let ocrData;
      try {
        ocrData = JSON.parse(jsonMatch[0]);
      } catch (e) {
        throw new Error("OCR识别结果解析失败");
      }

      // 检查是否有处方号
      if (!ocrData['处方号'] || ocrData['处方号'].trim() === '') {
        throw new Error("无法识别到处方ID，请重新上传");
      }

      // OCR识别只返回结果，不保存到数据库
      // 用户在前端确认后调用 savePrescription 接口才保存
      return {
        code: 0,
        data: {
          data: ocrData
        }
      };
    } else {
      throw new Error("OCR识别失败");
    }
  } catch (error) {
    console.error('OCR识别错误:', error);
    throw error;
  }
}

// 获取处方历史
async function getPrescriptionHistory(openid) {
  if (!openid) {
    throw new Error("缺少用户标识");
  }

  const prescriptions = await Prescription.findAll({
    where: { openid },
    order: [["updatedAt", "DESC"]],
  });

  const prescriptionList = prescriptions.map((p) => ({
    prescriptionId: p.prescriptionId,
    image: p.image,
    text: p.text ? JSON.parse(p.text) : null,
    createTime: p.createTime,
  }));

  return { code: 0, data: prescriptionList };
}

// 保存处方
async function savePrescription(prescriptionData, openid) {
  console.log('========================================');
  console.log('保存处方 - 接收到的数据:');
  console.log(JSON.stringify(prescriptionData, null, 2));
  console.log('========================================');

  // 支持中文键名和英文键名
  const prescriptionId = prescriptionData.prescriptionId || prescriptionData['处方号'];
  const name = prescriptionData.name || prescriptionData['姓名'];
  const rp = prescriptionData.rp || prescriptionData['Rp'];
  const medicines = prescriptionData.medicines || prescriptionData['药方'];

  console.log('提取的字段:');
  console.log('  prescriptionId:', prescriptionId);
  console.log('  name:', name);
  console.log('  rp:', rp);
  console.log('  medicines:', medicines);
  console.log('========================================');

  // 验证必填字段
  if (!prescriptionId) {
    throw new Error("缺少处方ID");
  }

  if (!name || name.trim() === '') {
    throw new Error("请填写姓名");
  }

  if (!rp || rp.trim() === '') {
    throw new Error("请填写Rp内容");
  }

  if (!medicines || !Array.isArray(medicines) || medicines.length === 0) {
    throw new Error("请填写药方");
  }

  // 验证药方每一项
  for (let i = 0; i < medicines.length; i++) {
    const med = medicines[i];
    const medName = med.name || med['药名'];
    const medQuantity = med.quantity || med['数量'];
    
    if (!medName || medName.trim() === '') {
      throw new Error(`第${i + 1}味药：请填写药名`);
    }
    if (!medQuantity || medQuantity.trim() === '') {
      throw new Error(`第${i + 1}味药：请填写数量`);
    }
  }

  // 检查处方ID是否已存在
  const existingPrescription = await Prescription.findByPk(prescriptionId);
  let prescription;

  if (existingPrescription) {
    // 处方已存在，更新记录
    console.log('处方已存在，更新记录');
    prescription = await Prescription.update(
      {
        openid,
        image: prescriptionData.image || existingPrescription.image,
        text: JSON.stringify(prescriptionData),
      },
      { where: { prescriptionId } }
    );
    
    prescription = await Prescription.findByPk(prescriptionId);
    console.log('处方更新成功:', prescription);
  } else {
    // 处方不存在，创建新记录
    console.log('准备保存到处方表...');
    prescription = await Prescription.create({
      prescriptionId: prescriptionId,
      openid,
      image: prescriptionData.image || '',
      text: JSON.stringify(prescriptionData),
    });
    console.log('处方创建成功:', prescription);
  }

  return { code: 0, data: prescription };
}

// 更新处方
async function updatePrescription(prescriptionId, prescriptionData) {
  if (!prescriptionId) {
    throw new Error("缺少处方ID");
  }

  const prescription = await Prescription.findByPk(prescriptionId);
  if (!prescription) {
    throw new Error("处方不存在");
  }

  await Prescription.update(
    { 
      image: prescriptionData.image || prescription.image,
      text: JSON.stringify(prescriptionData)
    },
    { where: { prescriptionId } }
  );

  return { code: 0, message: "更新成功" };
}

// 删除处方
async function deletePrescription(prescriptionId) {
  if (!prescriptionId) {
    throw new Error("缺少处方ID");
  }

  const prescription = await Prescription.findByPk(prescriptionId);
  if (!prescription) {
    throw new Error("处方不存在");
  }

  await Prescription.destroy({
    where: { prescriptionId }
  });

  return { code: 0, message: "删除成功" };
}

// 获取所有处方列表（管理员）
async function getPrescriptionsList({ page = 1, pageSize = 20, keyword = '' }) {
  let prescriptions = await Prescription.findAll({
    order: [["updatedAt", "DESC"]],
  });

  // 关键词搜索
  if (keyword) {
    const keywordLower = keyword.toLowerCase();
    prescriptions = prescriptions.filter(p => {
      const text = p.text ? JSON.parse(p.text) : {};
      return (
        p.prescriptionId.toLowerCase().includes(keywordLower) ||
        (text['姓名'] && text['姓名'].toLowerCase().includes(keywordLower)) ||
        (text['处方号'] && text['处方号'].toLowerCase().includes(keywordLower))
      );
    });
  }

  // 分页
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedPrescriptions = prescriptions.slice(startIndex, endIndex);

  const prescriptionList = paginatedPrescriptions.map((p) => {
    const text = p.text ? JSON.parse(p.text) : {};
    
    // 中文键名到英文键名的映射
    const keyMap = {
      '处方号': 'prescriptionId',
      '姓名': 'name',
      '年龄': 'age',
      '日期': 'date',
      '脉象': 'pulse',
      '舌像': 'tongue',
      '症状及诊断': 'symptoms',
      'Rp': 'rp',
      '药方': 'medicines',
      '医师': 'doctor'
    };

    // 转换中文键名为英文键名
    const convertedData = {};
    for (const [key, value] of Object.entries(text)) {
      const englishKey = keyMap[key] || key;
      if (englishKey === 'medicines' && Array.isArray(value)) {
        convertedData[englishKey] = value.map(med => ({
          name: med.药名 || med.name || '',
          quantity: med.数量 || med.quantity || ''
        }));
      } else {
        convertedData[englishKey] = value;
      }
    }

    return {
      prescriptionId: p.prescriptionId,
      openid: p.openid,
      image: p.image,
      data: convertedData,
      createTime: p.createTime,
    };
  });

  return {
    code: 0,
    data: prescriptionList,
    pagination: {
      page,
      pageSize,
      totalCount: prescriptions.length,
      totalPages: Math.ceil(prescriptions.length / pageSize)
    }
  };
}

module.exports = {
  handlePrescriptionOCR,
  getPrescriptionHistory,
  savePrescription,
  updatePrescription,
  deletePrescription,
  getPrescriptionsList,
};