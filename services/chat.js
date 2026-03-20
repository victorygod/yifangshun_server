const { ChatMessage } = require('../wrappers/db-wrapper');

// 生成 AI 回复（模拟）
function generateReply(message) {
  // 这里可以接入真实的 AI 服务
  // 目前返回固定的回复
  return "感谢您的咨询，我们会尽快回复您。";
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
async function handleChat(message, openid) {
  if (!message) {
    throw new Error("消息内容不能为空");
  }

  // 生成回复
  const reply = generateReply(message);

  // 保存消息
  await saveUserMessage(openid, message);
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