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
async function handlePrescriptionOCR(image, openid, thumbnail) {
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
  'Rp': '完整的Rp内容',
  '剂数': '一般是中文繁体大写数字，输出时转为阿拉伯数字',
  '服用方式': '内服还是外用',
  '药方': [
    // Rp中每款中药以及数量，不是药名的内容不用写
    {
      '药名': '',
      '数量': '',
      '备注': ''  // 如果某个药材左上角或右上角有小字，一般为四种：先煎、后下、打、另包，写在这里，左右都有的用逗号分隔
    }
  ],
  '医师': '肖笃凯'
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
      return {
        code: 0,
        data: {
          data: ocrData,
          thumbnail: thumbnail
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

  const prescriptionList = prescriptions.map((p) => {
    const data = p.data ? JSON.parse(p.data) : {};
    
    // 中文键名到英文键名的映射（与 getPrescriptionsList 保持一致）
    const keyMap = {
      '处方号': 'prescriptionId',
      '姓名': 'name',
      '年龄': 'age',
      '日期': 'date',
      'Rp': 'rp',
      '剂数': 'dosage',
      '服用方式': 'administrationMethod',
      '药方': 'medicines',
      '医师': 'doctor'
    };

    // 转换中文键名为英文键名
    const convertedData = {};
    for (const [key, value] of Object.entries(data)) {
      const englishKey = keyMap[key] || key;
      if (englishKey === 'medicines' && Array.isArray(value)) {
        convertedData[englishKey] = value.map(med => ({
          name: med.药名 || med.name || '',
          quantity: med.数量 || med.quantity || '',
          note: med.备注 || med.note || ''
        }));
      } else {
        convertedData[englishKey] = value;
      }
    }

    return {
      id: p.id,
      prescriptionId: p.prescriptionId,
      status: p.status,
      data: convertedData,
      thumbnail: p.thumbnail,
      createTime: p.createTime,
      updatedAt: p.updatedAt,
    };
  });

  return { code: 0, data: prescriptionList };
}

// 保存处方
async function savePrescription(prescriptionData, openid, thumbnail, isAutoSave = false, skipValidation = false) {
  console.log('========================================');
  console.log('保存处方 - 接收到的数据:');
  console.log(JSON.stringify(prescriptionData, null, 2));
  console.log('========================================');

  // 获取用户信息
  const { User } = require('../wrappers/db-wrapper');
  const user = await User.findByPk(openid);
  
  if (!user) {
    throw new Error("用户不存在");
  }

  // 普通用户上传时实时判断今日待审核处方数
  if (user.role === 'user') {
    const todayPendingCount = await checkTodayPendingPrescriptions(openid);
    if (todayPendingCount >= 10) {
      throw new Error("今日待审核处方已达上限（10个），请明天再试");
    }
  }

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

  // 验证必填字段（如果是skipValidation模式，只校验处方ID）
  if (!prescriptionId) {
    throw new Error("缺少处方ID");
  }

  // 如果不是跳过校验模式，并且是管理员，需要校验所有字段
  if (!skipValidation && (user.role === 'admin' || user.role === 'super_admin')) {
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
  }

  // 转换中文键名为英文键名（确保 data 字段中始终使用英文键名）
  const keyMap = {
    '处方号': 'prescriptionId',
    '姓名': 'name',
    '年龄': 'age',
    '日期': 'date',
    'Rp': 'rp',
    '剂数': 'dosage',
    '服用方式': 'administrationMethod',
    '药方': 'medicines',
    '医师': 'doctor'
  };

  const convertedData = {};
  for (const [key, value] of Object.entries(prescriptionData)) {
    const englishKey = keyMap[key] || key;
    if (englishKey === 'medicines' && Array.isArray(value)) {
      convertedData[englishKey] = value.map(med => ({
        name: med.药名 || med.name || '',
        quantity: med.数量 || med.quantity || '',
        note: med.备注 || med.note || ''
      }));
    } else {
      convertedData[englishKey] = value;
    }
  }

  console.log('转换后的数据:');
  console.log(JSON.stringify(convertedData, null, 2));
  console.log('========================================');

  // 根据用户角色设置状态
  const status = skipValidation ? '待审核' : ((user.role === 'admin' || user.role === 'super_admin') ? '已审核' : '待审核');
  const reviewer = skipValidation ? null : ((user.role === 'admin' || user.role === 'super_admin') ? user.name : null);
  const reviewDate = skipValidation ? null : ((user.role === 'admin' || user.role === 'super_admin') ? new Date() : null);

  // 检查是否有重复的处方ID（无论普通用户还是管理员都需要检查）
  const existingPrescription = await Prescription.findOne({
    where: {
      prescriptionId: prescriptionId,
      status: status
    }
  });

  if (existingPrescription) {
    // 普通用户：直接返回错误
    if (user.role === 'user' || skipValidation) {
      throw new Error(`处方ID "${prescriptionId}" 已存在待审核状态，请勿重复上传`);
    }
    
    // 管理员：返回需要确认的信息（类似审核流程）
    if (user.role === 'admin' || user.role === 'super_admin') {
      console.log('========================================');
      console.log('发现重复处方ID');
      console.log('  处方ID:', prescriptionId);
      console.log('  状态:', status);
      console.log('========================================');
      
      return {
        code: 2,
        message: `处方ID "${prescriptionId}" 已存在，是否覆盖？`,
        existingPrescription: {
          id: existingPrescription.id,
          prescriptionId: existingPrescription.prescriptionId,
          data: JSON.parse(existingPrescription.data),
          reviewer: existingPrescription.reviewer,
          reviewDate: existingPrescription.reviewDate
        },
        newPrescription: {
          prescriptionId: prescriptionId,
          data: convertedData,
          thumbnail: thumbnail
        }
      };
    }
  }

  // 创建新记录
  const newPrescription = await Prescription.create({
    prescriptionId: prescriptionId,
    openid,
    status: status,
    data: JSON.stringify(convertedData),
    thumbnail: thumbnail || '',
    prescriptionDate: prescriptionData.date || new Date().toISOString().split('T')[0],
    reviewer: reviewer,
    reviewDate: reviewDate,
  });

  console.log('处方创建成功:', newPrescription);

  return { code: 0, data: newPrescription };
}

// 更新处方
async function updatePrescription(id, prescriptionId, prescriptionData, thumbnail = null) {
  if (!id) {
    throw new Error("缺少处方ID");
  }

  // 验证 id 必须是复合主键格式（prescriptionId_status）
  if (!id.includes('_')) {
    throw new Error("请使用复合主键（格式：prescriptionId_status）作为id参数");
  }

  console.log('========================================');
  console.log('更新处方 - 输入参数:');
  console.log('  id:', id);
  console.log('  是否包含下划线:', id.includes('_'));
  console.log('========================================');

  // 只使用复合主键查找
  let prescription = await Prescription.findByPk(id);
  
  console.log('更新处方 - findByPk 查找结果:', prescription ? '找到' : '未找到');
  
  if (!prescription) {
    throw new Error("处方不存在");
  }

  console.log('更新处方 - 最终选择的处方:');
  console.log('  id:', prescription.id);
  console.log('  prescriptionId:', prescription.prescriptionId);
  console.log('  status:', prescription.status);

  // 转换中文键名为英文键名（确保 data 字段中始终使用英文键名）
  const keyMap = {
    '处方号': 'prescriptionId',
    '姓名': 'name',
    '年龄': 'age',
    '日期': 'date',
    'Rp': 'rp',
    '剂数': 'dosage',
    '服用方式': 'administrationMethod',
    '药方': 'medicines',
    '医师': 'doctor'
  };

  const convertedData = {};
  for (const [key, value] of Object.entries(prescriptionData)) {
    const englishKey = keyMap[key] || key;
    if (englishKey === 'medicines' && Array.isArray(value)) {
      convertedData[englishKey] = value.map(med => ({
        name: med.药名 || med.name || '',
        quantity: med.数量 || med.quantity || '',
        note: med.备注 || med.note || ''
      }));
    } else {
      convertedData[englishKey] = value;
    }
  }

  console.log('更新处方 - 转换后的数据:');
  console.log(JSON.stringify(convertedData, null, 2));
  console.log('========================================');

  // 构建更新数据
  const updateData = {
    data: JSON.stringify(convertedData),
    modifyDate: new Date()
  };

  // 如果提供了新的处方ID，则更新处方ID
  if (prescriptionId && prescriptionId !== prescription.prescriptionId) {
    updateData.prescriptionId = prescriptionId;
    console.log('更新处方 - 准备更新处方ID:', prescriptionId);
  }

  // 如果提供了新的缩略图，则更新缩略图
  if (thumbnail !== null && thumbnail !== undefined) {
    updateData.thumbnail = thumbnail;
    console.log('更新处方 - 准备更新缩略图，长度:', thumbnail.length);
  } else {
    console.log('更新处方 - 未提供缩略图参数');
  }

  console.log('更新处方 - 准备更新，使用主键:', prescription.id);
  await Prescription.update(updateData, { where: { id: prescription.id } });

  return { code: 0, message: "更新成功" };
}

// 删除处方
async function deletePrescription(prescriptionId, openid) {
  if (!prescriptionId) {
    throw new Error("缺少处方ID");
  }

  if (!openid) {
    throw new Error("缺少用户标识");
  }

  // 尝试使用复合主键查找（prescriptionId_status格式）
  let prescription = await Prescription.findByPk(prescriptionId);
  
  console.log('删除处方 - 复合主键查找结果:', prescription ? '找到' : '未找到');
  
  // 如果找不到，尝试使用prescriptionId字段查找
  if (!prescription) {
    console.log('删除处方 - 尝试使用prescriptionId字段查找:', prescriptionId);
    prescription = await Prescription.findOne({
      where: { prescriptionId, status: '待审核' }
    });
    console.log('删除处方 - 字段查找结果:', prescription ? '找到' : '未找到');
  }
  
  if (!prescription) {
    throw new Error("处方不存在");
  }

  // 获取用户信息
  const { User } = require('../wrappers/db-wrapper');
  const user = await User.findByPk(openid);
  if (!user) {
    throw new Error("用户不存在");
  }

  console.log('删除处方 - 权限检查:');
  console.log('  处方openid:', prescription.openid);
  console.log('  用户openid:', openid);
  console.log('  用户role:', user.role);
  console.log('  处方状态:', prescription.status);

  // 普通用户只能删除自己上传的待审核处方
  if (user.role === 'user') {
    if (prescription.status !== '待审核') {
      throw new Error("只能删除待审核状态的处方");
    }
    if (prescription.openid !== openid) {
      throw new Error("权限不足，只能删除自己的处方");
    }
  }

  // 管理员可以删除任意状态的处方
  await prescription.destroy();

  return { code: 0, message: "删除成功" };
}

// 获取所有处方列表（管理员）
async function getPrescriptionsList({ page = 1, pageSize = 20, keyword = '', status = 'all', openid = '' } = {}) {
  let where = {};

  // 状态筛选
  if (status !== 'all') {
    where.status = status;
  }

  // 用户筛选
  if (openid) {
    where.openid = openid;
  }

  let prescriptions = await Prescription.findAll({
    where,
    order: [["updatedAt", "DESC"]],
  });

  // 关键词搜索
  if (keyword) {
    const keywordLower = keyword.toLowerCase();
    prescriptions = prescriptions.filter(p => {
      const data = p.data ? JSON.parse(p.data) : {};
      return (
        p.prescriptionId.toLowerCase().includes(keywordLower) ||
        (data['姓名'] && data['姓名'].toLowerCase().includes(keywordLower)) ||
        (data['name'] && data['name'].toLowerCase().includes(keywordLower)) ||
        (data['处方号'] && data['处方号'].toLowerCase().includes(keywordLower)) ||
        (data['prescriptionId'] && data['prescriptionId'].toLowerCase().includes(keywordLower))
      );
    });
  }

  // 分页
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedPrescriptions = prescriptions.slice(startIndex, endIndex);

  const prescriptionList = paginatedPrescriptions.map((p) => {
    const data = p.data ? JSON.parse(p.data) : {};
    
    // 中文键名到英文键名的映射
    const keyMap = {
      '处方号': 'prescriptionId',
      '姓名': 'name',
      '年龄': 'age',
      '日期': 'date',
      'Rp': 'rp',
      '剂数': 'dosage',
      '服用方式': 'administrationMethod',
      '药方': 'medicines',
      '医师': 'doctor'
    };

    // 转换中文键名为英文键名
    const convertedData = {};
    for (const [key, value] of Object.entries(data)) {
      const englishKey = keyMap[key] || key;
      if (englishKey === 'medicines' && Array.isArray(value)) {
        convertedData[englishKey] = value.map(med => ({
          name: med.药名 || med.name || '',
          quantity: med.数量 || med.quantity || '',
          note: med.备注 || med.note || ''
        }));
      } else {
        convertedData[englishKey] = value;
      }
    }

    return {
      id: p.id,
      prescriptionId: p.prescriptionId,
      openid: p.openid,
      status: p.status,
      data: convertedData,
      thumbnail: p.thumbnail,
      reviewer: p.reviewer,
      reviewDate: p.reviewDate,
      modifyDate: p.modifyDate,
      createTime: p.createTime,
      updatedAt: p.updatedAt,
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

// 获取待审核处方列表
async function getPendingPrescriptions({ page = 1, pageSize = 20 } = {}) {
  return getPrescriptionsList({ page, pageSize, status: '待审核' });
}

// 审核处方
async function reviewPrescription(id, action, reviewerOpenid, reviewerName) {
  if (!id) {
    throw new Error("缺少处方ID");
  }

  if (!action || !['approve', 'reject'].includes(action)) {
    throw new Error("无效的审核操作");
  }

  console.log('========================================');
  console.log('审核处方 - 输入参数:');
  console.log('  id:', id);
  console.log('  是否包含下划线:', id.includes('_'));
  console.log('  action:', action);
  console.log('========================================');

  let prescription = await Prescription.findByPk(id);
  
  console.log('审核处方 - findByPk 查找结果:', prescription ? '找到' : '未找到');
  
  // 如果找不到，尝试使用 prescriptionId 字段查找（优先找待审核的）
  if (!prescription) {
    console.log('审核处方 - 尝试使用 prescriptionId 字段查找:', id);
    prescription = await Prescription.findOne({
      where: { 
        prescriptionId: id,
        status: '待审核'
      }
    });
    console.log('审核处方 - 字段查找结果（待审核）:', prescription ? '找到' : '未找到');
    
    // 如果找不到待审核的，查找已审核的（用于错误提示）
    if (!prescription) {
      const approvedPrescription = await Prescription.findOne({
        where: { 
          prescriptionId: id,
          status: '已审核'
        }
      });
      if (approvedPrescription) {
        throw new Error(`处方ID "${id}" 已是已审核状态，无需重复审核`);
      }
      throw new Error("处方不存在");
    }
  }
  
  if (!prescription) {
    throw new Error("处方不存在");
  }

  console.log('审核处方 - 最终选择的处方:');
  console.log('  id:', prescription.id);
  console.log('  prescriptionId:', prescription.prescriptionId);
  console.log('  status:', prescription.status);

  if (prescription.status !== '待审核') {
    throw new Error("只能审核待审核状态的处方");
  }

  // 拒绝审核：直接删除
  if (action === 'reject') {
    await prescription.destroy();
    return { code: 0, message: "审核拒绝，处方已删除" };
  }

  // 审核通过：检查是否有重复处方ID
  let prescriptionData;
  
  try {
    // 检查 data 字段是否为字符串
    if (typeof prescription.data !== 'string') {
      console.error('审核通过 - data字段不是字符串类型:', typeof prescription.data);
      throw new Error('处方数据格式错误');
    }
    
    prescriptionData = JSON.parse(prescription.data);
    
    // 验证解析后的数据结构
    if (!prescriptionData || typeof prescriptionData !== 'object') {
      console.error('审核通过 - data解析后不是对象:', prescriptionData);
      throw new Error('处方数据格式错误');
    }
    
    console.log('审核通过 - data解析成功:', prescriptionData);
  } catch (error) {
    console.error('审核通过 - JSON.parse失败:', error);
    console.error('  data字段原始值:', prescription.data);
    throw new Error('处方数据格式错误，无法解析');
  }
  
  // 优先使用 data 中的 prescriptionId，如果没有则从主键中提取
  let targetPrescriptionId = prescriptionData.prescriptionId;
  
  if (!targetPrescriptionId && prescription.id.includes('_')) {
    // 从主键 "prescriptionId_status" 中提取 prescriptionId
    const parts = prescription.id.split('_');
    if (parts.length > 0) {
      targetPrescriptionId = parts[0];
    }
  }
  
  console.log('========================================');
  console.log('审核通过 - 检查重复处方ID');
  console.log('  当前处方ID:', targetPrescriptionId);
  console.log('  data中的prescriptionId:', prescriptionData.prescriptionId);
  console.log('  主键:', prescription.id);
  console.log('  当前处方状态:', prescription.status);
  console.log('========================================');

  const existingPrescription = await Prescription.findOne({
    where: {
      prescriptionId: targetPrescriptionId,
      status: '已审核',
      id: { [Op.ne]: prescription.id }  // 使用处方的主键而不是输入的 id
    }
  });

  console.log('重复检查结果:', existingPrescription ? '找到重复处方' : '未找到重复处方');
  
  if (existingPrescription) {
    console.log('重复处方信息:');
    console.log('  id:', existingPrescription.id);
    console.log('  prescriptionId:', existingPrescription.prescriptionId);
    console.log('  status:', existingPrescription.status);
    console.log('========================================');
    
    // 返回需要确认的信息
    return {
      code: 2,
      message: "已审核状态下已存在相同处方ID，是否覆盖？",
      existingPrescription: {
        id: existingPrescription.id,
        prescriptionId: existingPrescription.prescriptionId,
        data: JSON.parse(existingPrescription.data),
        reviewDate: existingPrescription.reviewDate
      },
      newPrescription: {
        id: prescription.id,
        prescriptionId: prescription.prescriptionId,
        data: prescriptionData
      }
    };
  }

  console.log('========================================');
  console.log('审核通过 - 检查完成，未找到重复处方');
  console.log('========================================');

  // 验证药材数量不为空（管理员审核时需要验证）
  const medicines = prescriptionData.medicines || prescriptionData['药方'];
  if (medicines && Array.isArray(medicines) && medicines.length > 0) {
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
  }

  // 没有重复，直接通过审核
  // 由于本地数据库的主键是 prescriptionId_status，需要删除旧记录并创建新记录
  const newId = `${targetPrescriptionId}_已审核`;
  
  console.log('审核通过 - 准备创建新记录');
  console.log('  旧 id:', prescription.id);
  console.log('  新 id:', newId);
  
  // 删除旧记录
  await prescription.destroy();
  console.log('旧记录已删除');
  
  // 创建新记录（已审核状态）
  const newPrescription = await Prescription.create({
    id: newId,
    prescriptionId: targetPrescriptionId,
    openid: prescription.openid,
    status: '已审核',
    data: JSON.stringify(prescriptionData),
    thumbnail: prescription.thumbnail,
    reviewer: reviewerName,
    reviewDate: new Date(),
    modifyDate: new Date(),
    prescriptionDate: prescription.prescriptionDate,
    createTime: prescription.createTime,
    updatedAt: new Date().toISOString()
  });
  
  console.log('新记录已创建:', newPrescription.id);

  return {
    code: 0,
    message: "审核成功"
  };
}

// 确认审核通过（覆盖旧记录）
async function confirmPrescriptionApprove(id, reviewerOpenid, reviewerName) {
  if (!id) {
    throw new Error("缺少处方ID");
  }

  const prescription = await Prescription.findByPk(id);
  if (!prescription) {
    throw new Error("处方不存在");
  }

  let prescriptionData;
  
  try {
    // 检查 data 字段是否为字符串
    if (typeof prescription.data !== 'string') {
      console.error('确认审核通过 - data字段不是字符串类型:', typeof prescription.data);
      throw new Error('处方数据格式错误');
    }
    
    prescriptionData = JSON.parse(prescription.data);
    
    // 验证解析后的数据结构
    if (!prescriptionData || typeof prescriptionData !== 'object') {
      console.error('确认审核通过 - data解析后不是对象:', prescriptionData);
      throw new Error('处方数据格式错误');
    }
    
    console.log('确认审核通过 - data解析成功:', prescriptionData);
  } catch (error) {
    console.error('确认审核通过 - JSON.parse失败:', error);
    console.error('  data字段原始值:', prescription.data);
    throw new Error('处方数据格式错误，无法解析');
  }

  // 验证药材数量不为空（管理员审核时需要验证）
  const medicines = prescriptionData.medicines || prescriptionData['药方'];
  if (medicines && Array.isArray(medicines) && medicines.length > 0) {
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
  }
  
  // 优先使用 data 中的 prescriptionId，如果没有则从主键中提取
  let targetPrescriptionId = prescriptionData.prescriptionId;
  
  if (!targetPrescriptionId && prescription.id.includes('_')) {
    // 从主键 "prescriptionId_status" 中提取 prescriptionId
    const parts = prescription.id.split('_');
    if (parts.length > 0) {
      targetPrescriptionId = parts[0];
    }
  }

  // 检查"已审核"状态下是否已存在相同prescriptionId
  const existingPrescription = await Prescription.findOne({
    where: {
      prescriptionId: targetPrescriptionId,
      status: '已审核',
      id: { [Op.ne]: id }
    }
  });

  if (existingPrescription) {
    // 更新旧记录为新的处方信息，保留缩略图
    await existingPrescription.update({
      data: JSON.stringify(prescriptionData),
      reviewer: reviewerName,
      reviewDate: new Date(),
      modifyDate: new Date(),
      thumbnail: prescription.thumbnail || existingPrescription.thumbnail
    });
    
    // 删除当前处方记录
    await prescription.destroy();
    
    return {
      code: 0,
      message: "审核成功，已更新现有记录"
    };
  }

  // 更新当前处方为已审核
  // 由于本地数据库的主键是 prescriptionId_status，需要删除旧记录并创建新记录
  const newId = `${targetPrescriptionId}_已审核`;
  
  console.log('确认审核通过 - 准备创建新记录');
  console.log('  旧 id:', prescription.id);
  console.log('  新 id:', newId);
  
  // 删除当前处方记录
  await prescription.destroy();
  console.log('旧记录已删除');
  
  // 创建新记录（已审核状态）
  const newPrescription = await Prescription.create({
    id: newId,
    prescriptionId: targetPrescriptionId,
    openid: prescription.openid,
    status: '已审核',
    data: JSON.stringify(prescriptionData),
    thumbnail: prescription.thumbnail,
    reviewer: reviewerName,
    reviewDate: new Date(),
    modifyDate: new Date(),
    prescriptionDate: prescription.prescriptionDate,
    createTime: prescription.createTime,
    updatedAt: new Date().toISOString()
  });

  console.log('新记录已创建:', newPrescription.id);

  return {
    code: 0,
    message: "审核成功"
  };
}
// 更新处方ID（通过处方ID）
async function updatePrescriptionIdByPrescriptionId(oldPrescriptionId, newPrescriptionId) {
  if (!oldPrescriptionId || !newPrescriptionId) {
    throw new Error("缺少必要参数");
  }

  const prescription = await Prescription.findOne({
    where: { prescriptionId: oldPrescriptionId }
  });
  
  if (!prescription) {
    throw new Error("处方不存在");
  }

  // 检查相同status下是否已存在新的prescriptionId
  const existingPrescription = await Prescription.findOne({
    where: {
      prescriptionId: newPrescriptionId,
      status: prescription.status,
      id: { [Op.ne]: prescription.id }
    }
  });

  if (existingPrescription) {
    // 更新旧记录为新的处方信息
    const existingData = JSON.parse(existingPrescription.data);
    const newData = JSON.parse(prescription.data);
    newData.prescriptionId = newPrescriptionId;
    
    console.log('existingPrescription对象:', existingPrescription);
    console.log('existingPrescription.update方法:', typeof existingPrescription.update);
    
    await existingPrescription.update({
      data: JSON.stringify(newData),
      modifyDate: new Date()
    });
    
    // 删除当前处方记录
    await prescription.destroy();
    
    return {
      code: 0,
      message: "处方ID更新成功，已合并到现有记录"
    };
  }

  // 更新当前处方的prescriptionId
  const prescriptionData = JSON.parse(prescription.data);
  prescriptionData.prescriptionId = newPrescriptionId;

  // 由于主键包含prescriptionId，需要删除旧记录并创建新记录
  const oldId = prescription.id;
  const newId = `${newPrescriptionId}_${prescription.status}`;
  
  console.log('准备删除处方记录');
  console.log('prescription对象:', prescription);
  console.log('prescription.destroy方法:', typeof prescription.destroy);
  
  await prescription.destroy();
  
  console.log('处方记录删除成功');
  
  const newPrescription = await Prescription.create({
    id: newId,
    prescriptionId: newPrescriptionId,
    openid: prescription.openid,
    status: prescription.status,
    data: JSON.stringify(prescriptionData),
    thumbnail: prescription.thumbnail,
    prescriptionDate: prescription.prescriptionDate,
    modifyDate: new Date()
  });

  return {
    code: 0,
    message: "处方ID更新成功"
  };
}

// 清理超时未审核的处方（管理员登录时自动执行）
async function cleanExpiredPrescriptions() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  console.log(`========================================`);
  console.log(`开始清理过期处方`);
  console.log(`当前时间: ${new Date().toISOString()}`);
  console.log(`过期时间界限: ${sevenDaysAgo.toISOString()}`);
  console.log(`========================================`);

  // 查找超过7天未审核的处方
  const expiredPrescriptions = await Prescription.findAll({
    where: {
      status: '待审核',
      createTime: { [Op.lt]: sevenDaysAgo }
    }
  });

  console.log(`找到 ${expiredPrescriptions.length} 条过期处方`);
  expiredPrescriptions.forEach(p => {
    console.log(`  - ${p.prescriptionId}: ${p.createTime}`);
  });

  // 收集需要清理的缩略图链接
  const thumbnailsToClean = [];

  // 删除过期处方
  for (const prescription of expiredPrescriptions) {
    // 如果有缩略图，添加到清理列表
    if (prescription.thumbnail) {
      thumbnailsToClean.push(prescription.thumbnail);
    }

    await prescription.destroy();
    console.log(`删除过期处方: ${prescription.prescriptionId}`);
  }

  console.log(`清理完成，共删除 ${expiredPrescriptions.length} 条过期处方，${thumbnailsToClean.length} 个缩略图`);
  console.log(`========================================`);

  return {
    count: expiredPrescriptions.length,
    thumbnails: thumbnailsToClean
  };
}

// 检查用户今日待审核处方数
async function checkTodayPendingPrescriptions(openid) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const count = await Prescription.count({
    where: {
      openid,
      status: '待审核',
      createTime: { [Op.gte]: today }
    }
  });

  return count;
}

// 确认覆盖已存在的处方（管理员上传重复处方时使用）
async function confirmOverwritePrescription(prescriptionId, prescriptionData, thumbnail = null, openid) {
  console.log('========================================');
  console.log('确认覆盖处方');
  console.log('  prescriptionId:', prescriptionId);
  console.log('========================================');

  // 查找已存在的处方
  const existingPrescription = await Prescription.findOne({
    where: {
      prescriptionId: prescriptionId,
      status: '已审核'
    }
  });

  if (!existingPrescription) {
    throw new Error("处方不存在");
  }

  // 获取用户信息
  const { User } = require('../wrappers/db-wrapper');
  const user = await User.findByPk(openid);
  if (!user) {
    throw new Error("用户不存在");
  }

  // 复用 updatePrescription 更新处方数据
  // 传入复合主键（id）
  await updatePrescription(existingPrescription.id, prescriptionId, prescriptionData, thumbnail);

  // 单独更新 reviewer 和 reviewDate（updatePrescription 不会更新这些字段）
  await existingPrescription.update({
    reviewer: user.name,
    reviewDate: new Date()
  });

  console.log('处方覆盖成功');
  console.log('========================================');

  return {
    code: 0,
    message: "处方覆盖成功"
  };
}

module.exports = {
  handlePrescriptionOCR,
  getPrescriptionHistory,
  savePrescription,
  updatePrescription,
  deletePrescription,
  getPrescriptionsList,
  getPendingPrescriptions,
  reviewPrescription,
  confirmPrescriptionApprove,
  confirmOverwritePrescription,
  updatePrescriptionIdByPrescriptionId,
  cleanExpiredPrescriptions,
  checkTodayPendingPrescriptions,
};