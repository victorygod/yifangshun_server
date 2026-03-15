const { User, Op } = require('../wrappers/db-wrapper');
const fs = require('fs');
const path = require('path');

// 生成随机 ID
const generateId = () => Math.random().toString(36).substr(2, 9);

// 内存session管理（单进程）
const sessionStore = new Map();

// 存储session
function setSession(openid, sessionKey, expiresIn = 7200) {
  const expiresAt = Date.now() + expiresIn * 1000;
  sessionStore.set(openid, { sessionKey, expiresAt });
  console.log(`设置session: ${openid}, 过期时间: ${new Date(expiresAt).toISOString()}`);
}

// 获取session
function getSession(openid) {
  const session = sessionStore.get(openid);
  if (!session) return null;
  
  // 检查是否过期
  if (Date.now() > session.expiresAt) {
    console.log(`session已过期: ${openid}`);
    sessionStore.delete(openid);
    return null;
  }
  
  return session.sessionKey;
}

// 清理过期session（定时执行）
setInterval(() => {
  const now = Date.now();
  let cleanedCount = 0;
  for (const [openid, session] of sessionStore.entries()) {
    if (now > session.expiresAt) {
      sessionStore.delete(openid);
      cleanedCount++;
    }
  }
  if (cleanedCount > 0) {
    console.log(`清理过期session: 共清理 ${cleanedCount} 条`);
  }
}, 3600000);  // 每小时清理一次

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
      role: 'user',
      isNewUser: true,
    });

    // 设置session
    setSession(openid, sessionKey);

    return {
      code: 0,
      data: {
        openid,
        sessionKey,
        isNewUser: true,
        role: 'user',
      },
    };
  } else {
    // 老用户，更新sessionKey
    const sessionKey = `session_${generateId()}`;
    await User.update(
      { code },
      { where: { openid: user.openid } }
    );

    // 设置session
    setSession(user.openid, sessionKey);

    return {
      code: 0,
      data: {
        openid: user.openid,
        sessionKey: sessionKey,
        phone: user.phone,
        name: user.name,
        isNewUser: false,
        role: user.role || 'user',
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

// 绑定手机号
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

  return {
    code: 0,
    data: {
      isAdmin: user.role === 'admin' || user.role === 'super_admin',
      role: user.role || 'user',
    },
  };
}

// 获取用户信息
async function getUserInfo(openid) {
  if (!openid) {
    throw new Error("缺少用户标识");
  }

  const user = await User.findByPk(openid);

  if (!user) {
    throw new Error("用户不存在");
  }

  return {
    code: 0,
    data: {
      openid: user.openid,
      name: user.name,
      phone: user.phone,
      role: user.role || 'user',
      isNewUser: user.isNewUser,
      createdAt: user.createdAt,
    },
  };
}

// 设置用户角色
async function setUserRole(targetOpenid, newRole, operatorOpenid) {
  if (!targetOpenid || !newRole || !operatorOpenid) {
    throw new Error("缺少必要参数");
  }

  // 验证角色值
  if (!['user', 'admin', 'super_admin'].includes(newRole)) {
    throw new Error("无效的角色值");
  }

  // 查找操作者
  const operator = await User.findByPk(operatorOpenid);
  if (!operator) {
    throw new Error("操作者不存在");
  }

  // 只有超级管理员可以设置角色
  if (operator.role !== 'super_admin') {
    throw new Error("权限不足，只有超级管理员可以设置角色");
  }

  // 查找目标用户
  const targetUser = await User.findByPk(targetOpenid);
  if (!targetUser) {
    throw new Error("目标用户不存在");
  }

  // 不能将自己降级为普通用户（至少保留一个管理员）
  if (targetOpenid === operatorOpenid && newRole !== 'super_admin') {
    // 检查是否还有其他超级管理员
    const otherSuperAdmins = await User.findAll({
      where: {
        role: 'super_admin',
        openid: { [Op.ne]: operatorOpenid }
      }
    });

    if (otherSuperAdmins.length === 0) {
      throw new Error("不能降级为普通用户，系统需要至少一个超级管理员");
    }
  }

  // 更新角色
  await User.update(
    { role: newRole },
    { where: { openid: targetOpenid } }
  );

  return { code: 0, message: "角色设置成功" };
}

// 获取用户列表
async function getUserList({ role = 'all', page = 1, pageSize = 20 } = {}) {
  let where = {};

  // 角色筛选
  if (role !== 'all') {
    where.role = role;
  }

  const { count, rows } = await User.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  });

  const userList = rows.map(user => ({
    openid: user.openid,
    name: user.name,
    phone: user.phone,
    role: user.role || 'user',
    isNewUser: user.isNewUser,
    createdAt: user.createdAt,
  }));

  return {
    code: 0,
    data: userList,
    pagination: {
      page,
      pageSize,
      totalCount: count,
      totalPages: Math.ceil(count / pageSize)
    }
  };
}

module.exports = {
  handleLogin,
  handleBindUserInfo,
  handleBindPhone,
  checkIsAdmin,
  getUserInfo,
  setUserRole,
  getUserList,
  setSession,
  getSession,
};