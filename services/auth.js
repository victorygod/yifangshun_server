const { User } = require('../wrappers/db-wrapper');
const fs = require('fs');
const path = require('path');

// 生成随机 ID
const generateId = () => Math.random().toString(36).substr(2, 9);

// 加载管理员配置文件
let adminsConfig = { admins: [] };
try {
  const adminsPath = path.join(__dirname, '../admins.json');
  if (fs.existsSync(adminsPath)) {
    const adminsData = fs.readFileSync(adminsPath, 'utf8');
    adminsConfig = JSON.parse(adminsData);
  }
} catch (error) {
  console.error("加载管理员配置文件失败:", error);
}

// 检查用户是否为管理员
function isAdmin(code, openid) {
  return adminsConfig.admins.some(admin => {
    // 优先通过 openid 匹配
    if (openid && admin.openid === openid) {
      return true;
    }
    // 其次通过 code 匹配
    if (code && admin.code === code) {
      return true;
    }
    return false;
  });
}

// 微信授权登录
async function handleLogin(code) {
  if (!code) {
    throw new Error("缺少登录code");
  }

  // 查找该code对应的用户
  let user = await User.findOne({ where: { code } });

  const isNewUser = !user;

  if (isNewUser) {
    // 新用户，创建用户
    const openid = `user_${generateId()}`;
    const sessionKey = `session_${generateId()}`;
    user = await User.create({
      openid,
      code,
      sessionKey,
      isNewUser: true,
    });

    // 检查是否为管理员（通过 openid 匹配）
    const userIsAdmin = isAdmin(null, openid);

    return {
      code: 0,
      data: {
        openid,
        sessionKey,
        isNewUser: true,
        isAdmin: userIsAdmin,
      },
    };
  } else {
    // 老用户，更新sessionKey
    const sessionKey = `session_${generateId()}`;
    await User.update(
      { sessionKey },
      { where: { openid: user.openid } }
    );

    // 检查用户是否为管理员（优先通过 openid 匹配）
    const isUserAdmin = isAdmin(null, user.openid);

    return {
      code: 0,
      data: {
        openid: user.openid,
        sessionKey: sessionKey,
        phone: user.phone,
        name: user.name,
        isNewUser: false,
        isAdmin: isUserAdmin,
      },
    };
  }
}

// 绑定用户信息（首次登录）
async function handleBindUserInfo(openid, name, phone) {
  if (!openid || !name || !phone) {
    throw new Error("缺少必要参数");
  }

  if (phone.length !== 11) {
    throw new Error("手机号格式不正确");
  }

  const user = await User.findByPk(openid);

  if (!user) {
    throw new Error("用户不存在");
  }

  await User.update(
    { phone, name, isNewUser: false },
    { where: { openid } }
  );

  return { code: 0, message: "绑定成功" };
}

// 绑定手机号（首次登录）- 兼容旧接口
async function handleBindPhone(openid, phone) {
  if (!openid || !phone) {
    throw new Error("缺少必要参数");
  }

  if (phone.length !== 11) {
    throw new Error("手机号格式不正确");
  }

  const user = await User.findByPk(openid);

  if (!user) {
    throw new Error("用户不存在");
  }

  await User.update(
    { phone, isNewUser: false },
    { where: { openid } }
  );

  return { code: 0, message: "绑定成功" };
}

// 检查用户是否为管理员
async function checkIsAdmin(openid) {
  if (!openid) {
    throw new Error("缺少用户标识");
  }

  // 查找用户信息
  const user = await User.findByPk(openid);

  if (!user) {
    throw new Error("用户不存在");
  }

  // 检查是否为管理员
  const isUserAdmin = isAdmin(user.code, user.openid);

  return {
    code: 0,
    data: {
      isAdmin: isUserAdmin,
    },
  };
}

module.exports = {
  handleLogin,
  handleBindUserInfo,
  handleBindPhone,
  checkIsAdmin,
};