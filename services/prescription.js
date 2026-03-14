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
  console.log('  云存储 URL:', image);
  console.log('  文件名称:', fileName);
  console.log('========================================');

  try {
    // 直接调用 Qwen-VL API，使用云存储 URL
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
                url: image
              }
            },
            {
              type: 'text',
              text: '识别图片'
            }
          ]
        }
      ],
      stream: false
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

module.exports = {
  handlePrescriptionOCR,
  getPrescriptionHistory,
};