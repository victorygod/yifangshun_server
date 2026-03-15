const { User, Op } = require('../wrappers/db-wrapper');
const fs = require('fs');
const path = require('path');

// ========================================
// 微信小程序配置
// ========================================
// 请设置你的微信小程序AppId和AppSecret
// 可以通过以下方式配置：
// 1. 环境变量：WECHAT_APPID 和 WECHAT_SECRET
// 2. 或直接修改下面的配置
// ========================================

const WECHAT_CONFIG = {
  appid: process.env.WECHAT_APPID || '', // 你的小程序AppId
  secret: process.env.WECHAT_SECRET || '' // 你的小程序AppSecret
};

// 检查是否配置了微信小程序信息
const hasWechatConfig = WECHAT_CONFIG.appid && WECHAT_CONFIG.secret;

if (!hasWechatConfig) {
  console.warn('========================================');
  console.warn('警告：未配置微信小程序AppId和AppSecret');
  console.warn('将使用测试模式登录');
  console.warn('请在环境变量中设置 WECHAT_APPID 和 WECHAT_SECRET');
  console.warn('========================================');
}

// 生成随机 ID
const generateId = () => Math.random().toString(36).substr(2, 9);

// ========================================
// 调用微信API获取openid和session_key
// ========================================
async function getWechatOpenid(code) {
  return new Promise((resolve, reject) => {
    const https = require('https');
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${WECHAT_CONFIG.appid}&secret=${WECHAT_CONFIG.secret}&js_code=${code}&grant_type=authorization_code`;
    
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          
          if (result.errcode) {
            reject(new Error(`微信API错误: ${result.errcode} - ${result.errmsg}`));
          } else {
            resolve({
              openid: result.openid,
              session_key: result.session_key,
              unionid: result.unionid
            });
          }
        } catch (error) {
          reject(new Error(`解析微信API响应失败: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`调用微信API失败: ${error.message}`));
    });
  });
}

// ========================================
// 内存session管理（单进程）
// ========================================
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

  console.log('========================================');
  console.log('处理登录请求');
  console.log('code:', code);
  console.log('配置状态:', hasWechatConfig ? '已配置微信小程序信息' : '未配置，使用测试模式');
  console.log('========================================');

  let openid, session_key;

  if (hasWechatConfig) {
    // 真实环境：调用微信API获取openid
    try {
      console.log('调用微信API获取openid...');
      const wechatData = await getWechatOpenid(code);
      openid = wechatData.openid;
      session_key = wechatData.session_key;
      console.log('微信API调用成功，openid:', openid);
    } catch (error) {
      console.error('调用微信API失败:', error.message);
      throw new Error(`登录失败: ${error.message}`);
    }
  } else {
    // 测试环境：使用固定的测试用户openid
    console.log('使用测试模式，固定openid: test_user_openid_001');
    openid = 'test_user_openid_001';
    session_key = `session_${generateId()}`;
  }

  // 查找该openid对应的用户
  let user = await User.findByPk(openid);

  const isNewUser = !user;

  if (isNewUser) {
    // 新用户，创建用户
    user = await User.create({
      openid,
      code,
      role: 'user',
      isNewUser: true,
    });

    console.log('创建新用户:', openid);

    // 设置session
    setSession(openid, session_key);

    return {
      code: 0,
      data: {
        openid,
        sessionKey: session_key,
        isNewUser: true,
        role: 'user',
        isAdmin: false,
      },
    };
  } else {
    // 老用户，更新code和sessionKey
    await User.update(
      { code },
      { where: { openid: user.openid } }
    );

    console.log('更新已有用户:', openid);

    // 设置session
    setSession(openid, session_key);

    const isAdmin = user.role === 'admin' || user.role === 'super_admin';

    return {
      code: 0,
      data: {
        openid: user.openid,
        sessionKey: session_key,
        phone: user.phone,
        name: user.name,
        isNewUser: false,
        role: user.role || 'user',
        isAdmin: isAdmin,
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
  console.log('========================================');
  console.log('检查管理员权限');
  console.log('openid:', openid);
  console.log('========================================');

  if (!openid) {
    throw new Error("缺少用户标识");
  }

  // 查找用户信息
  const user = await User.findByPk(openid);

  if (!user) {
    console.error('找不到用户，openid:', openid);
    throw new Error("用户不存在");
  }

  console.log('找到用户:', {
    openid: user.openid,
    role: user.role,
    phone: user.phone
  });

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