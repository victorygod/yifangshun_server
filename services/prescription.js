const { Prescription } = require('../db');

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

  // 提取文件名
  const fileName = image.split('/').pop();
  console.log('========================================');
  console.log('收到处方 OCR 请求');
  console.log('  请求时间:', new Date().toISOString());
  console.log('  openid:', openid || '未提供');
  console.log('  云存储 fileID:', image);
  console.log('  文件名称:', fileName);
  console.log('========================================');

  try {
    // 将云存储 fileID 转换为 HTTPS URL
    const imageUrl = convertCloudFileIdToUrl(image);

    // 直接调用 Qwen-VL API，使用转换后的 HTTPS URL
    console.log('开始调用 Qwen-VL API...');
    const apiKey = 'sk-25ad83b975ba4458a9983367888dd0dd';
    const apiUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

    const requestData = {
      model: 'qwen3-vl-flash',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: imageUrl
              }
            },
            {
              type: 'text',
              text: "识别中医处方，以json格式返回，遵循以下输出格式(药方里主要写Rp中每款中药以及数量，不是药名的内容不用写)：{'姓名': '','年龄': '','日期': '','脉象': '','舌像': '','症状及诊断': '','Rp': '完整的Rp内容','药方': [{'药名':'', '数量': ''}],'医师': '肖笃凯'}"
            }
          ]
        }
      ],
      stream: false,
      response_format: {type: "json_object"}
    };

    console.log('请求数据:', JSON.stringify(requestData, null, 2));

    // 使用 https 模块发送请求
    const https = require('https');
    const response = await new Promise((resolve, reject) => {
      const url = new URL(apiUrl);
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(JSON.stringify(requestData))
        },
        timeout: 60000  // 60秒超时
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode,
              data: JSON.parse(data)
            });
          } catch (error) {
            reject(new Error('解析响应失败'));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('请求超时，请稍后重试'));
      });

      req.write(JSON.stringify(requestData));
      req.end();
    });

    console.log('Qwen-VL API 响应');
    console.log('  状态码:', response.status);

    // 检查 HTTP 状态码
    if (response.status !== 200) {
      throw new Error(`API 返回错误状态码: ${response.status}`);
    }

    // 检查响应数据格式
    if (!response.data.choices || response.data.choices.length === 0) {
      throw new Error('API 响应格式错误: 缺少 choices 字段');
    }

    const ocrResult = response.data.choices[0].message.content;
    console.log('识别结果:', ocrResult);

    const prescriptionId = generateId();

    console.log('OCR 识别成功，返回结果');
    console.log('========================================');

    return {
      code: 0,
      data: {
        prescriptionId,
        text: ocrResult,
      },
    };
  } catch (error) {
    console.error('========================================');
    console.error('OCR 识别失败');
    console.error('  错误信息:', error.message);
    console.error('  错误详情:', error.response?.data || error);
    console.error('========================================');
    throw new Error(`OCR 识别失败: ${error.message}`);
  }
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

// 保存处方
async function savePrescription(prescriptionData, openid) {
  if (!prescriptionData) {
    throw new Error("缺少处方数据");
  }

  console.log('========================================');
  console.log('收到保存处方请求');
  console.log('  请求时间:', new Date().toISOString());
  console.log('  openid:', openid || '未提供');
  console.log('  处方数据:', JSON.stringify(prescriptionData, null, 2));
  console.log('========================================');

  try {
    const prescriptionId = generateId();

    const newPrescription = await Prescription.create({
      prescriptionId,
      openid: openid || 'system',
      image: '',
      text: JSON.stringify(prescriptionData),
      createTime: new Date()
    });

    console.log('处方保存成功');
    console.log('========================================');

    return {
      code: 0,
      data: {
        prescriptionId: newPrescription.prescriptionId,
        message: '处方保存成功'
      }
    };
  } catch (error) {
    console.error('========================================');
    console.error('处方保存失败');
    console.error('  错误信息:', error.message);
    console.error('========================================');
    throw new Error(`处方保存失败: ${error.message}`);
  }
}

// 获取所有处方列表（管理员）
async function getPrescriptionsList() {
  console.log('========================================');
  console.log('收到获取处方列表请求');
  console.log('  请求时间:', new Date().toISOString());
  console.log('========================================');

  try {
    const prescriptions = await Prescription.findAll({
      order: [["createTime", "DESC"]],
    });

    // 中文键名到英文键名的映射
    const keyMap = {
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

    const prescriptionList = prescriptions.map((p) => {
      let parsedText = {};
      try {
        parsedText = JSON.parse(p.text);
      } catch (e) {
        console.error('解析处方数据失败:', e);
      }

      // 将中文键名转换为英文键名
      const convertedData = {};
      for (const [key, value] of Object.entries(parsedText)) {
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
        data: convertedData,
        createTime: p.createTime
      };
    });

    console.log('获取处方列表成功，共', prescriptionList.length, '条记录');
    console.log('========================================');

    return {
      code: 0,
      data: prescriptionList
    };
  } catch (error) {
    console.error('========================================');
    console.error('获取处方列表失败');
    console.error('  错误信息:', error.message);
    console.error('========================================');
    throw new Error(`获取处方列表失败: ${error.message}`);
  }
}

module.exports = {
  handlePrescriptionOCR,
  getPrescriptionHistory,
  savePrescription,
  getPrescriptionsList,
};