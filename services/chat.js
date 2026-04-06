const https = require('https');
const { ChatMessage } = require('../wrappers/db-wrapper');
const llmConfig = require('../config/llm_config_loader');
const prescriptionService = require('./prescription');

// 调用 LLM 生成回复
async function generateReply(messages, phone) {
  const config = llmConfig.chat_llm_config;

  const requestBody = {
    model: config.model,
    messages
  };

  const requestBodyStr = JSON.stringify(requestBody);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: config.request.hostname,
      port: config.request.port,
      path: config.request.path,
      method: config.request.method,
      headers: {
        'Authorization': `Bearer ${config.api_key}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBodyStr)
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result.choices[0].message.content);
        } catch (e) {
          reject(new Error('LLM响应解析失败: ' + e.message));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error('LLM请求失败: ' + e.message));
    });

    req.write(requestBodyStr);
    req.end();
  });
}

// 构建 System Prompt（包含历史处方）
async function buildSystemPrompt(phone) {
  const config = llmConfig.chat_llm_config;
  const basePrompt = config.prompt;
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  // 获取历史处方
  let prescriptionSection = '';
  if (phone) {
    try {
      const result = await prescriptionService.getPrescriptionHistory(phone, {});
      if (result.code === 0 && result.data.rows && result.data.rows.length > 0) {
        const prescriptions = result.data.rows.slice(0, 10); // 只取最近10条
        prescriptionSection = '\n\n【用户历史处方】\n';
        for (const p of prescriptions) {
          const date = p.date || p.updatedAt || '';
          const diagnosis = p.data?.诊断 || p.data?.diagnosis || '无';
          const medicines = p.data?.药方 || p.data?.medicines || [];
          const medicineList = medicines.map(m => `${m.药名 || m.name}${m.数量 || m.quantity || ''}`).join('、');
          prescriptionSection += `- ${date}: 诊断【${diagnosis}】，用药【${medicineList}】\n`;
        }
      }
    } catch (e) {
      console.error('获取历史处方失败:', e);
    }
  }

  return `${basePrompt}\n\n当前时间：${now}${prescriptionSection}`;
}

// 构建消息列表
async function buildMessages(openid, currentInput, phone) {
  // 构建 system prompt
  const systemPrompt = await buildSystemPrompt(phone);

  // 获取历史对话（从数据库）
  const records = await ChatMessage.findAll({
    where: { openid },
    order: [["createTime", "ASC"]],
  });

  // 保留最近 10 组对话（20条消息）
  const recentRecords = records.slice(-20);

  // 构建消息列表
  const messages = [
    { role: "system", content: systemPrompt }
  ];

  // 添加历史对话
  for (const record of recentRecords) {
    messages.push({
      role: record.type === "user" ? "user" : "assistant",
      content: record.content
    });
  }

  // 添加当前输入
  messages.push({ role: "user", content: currentInput });

  return messages;
}

// 保存用户消息
async function saveUserMessage(openid, message) {
  await ChatMessage.create({
    openid: openid || "anonymous",
    content: message,
    type: "user",
  });
}

// 保存机器人回复
async function saveBotMessage(openid, reply) {
  await ChatMessage.create({
    openid: openid || "anonymous",
    content: reply,
    type: "bot",
  });
}

// AI 聊天（核心业务逻辑）
async function handleChat(message, openid, phone) {
  if (!message) {
    throw new Error("消息内容不能为空");
  }

  // 保存用户消息
  await saveUserMessage(openid, message);

  // 构建消息列表
  const messages = await buildMessages(openid, message, phone);

  // 调用 LLM 生成回复
  const reply = await generateReply(messages, phone);

  // 保存机器人回复
  await saveBotMessage(openid, reply);

  return {
    code: 0,
    data: {
      reply,
    },
  };
}

// 获取聊天历史
async function getChatHistory(openid) {
  if (!openid) {
    throw new Error("缺少用户标识");
  }

  const messages = await ChatMessage.findAll({
    where: { openid },
    order: [["createTime", "ASC"]],
  });

  const messageList = messages.map((msg) => ({
    id: msg.id,
    content: msg.content,
    type: msg.type,
    createTime: msg.createTime,
  }));

  return { code: 0, data: messageList };
}

module.exports = {
  handleChat,
  getChatHistory,
};