const { User, Prescription } = require('../wrappers/db-wrapper');

// 权限等级
const ROLE_LEVEL = {
  'user': 1,
  'admin': 2,
  'super_admin': 3
};

// 权限验证中间件
function requireRole(allowedRoles) {
  return async (req, res, next) => {
    try {
      // 从请求中获取 openid（优先检查 header，因为 body 可能是业务数据）
      // 优先级：header > query > body
      const openid = req.headers['x-openid'] || req.query.openid || req.body.openid;
      // 【首页登录改造】从 header 获取手机号
      const phone = req.headers['x-phone'];
      
      console.log('========================================');
      console.log('权限验证中间件');
      console.log('openid:', openid);
      console.log('phone:', phone);
      console.log('allowedRoles:', allowedRoles);
      console.log('========================================');
      
      // 【首页登录改造】检查是否为默认超级管理员手机号
      // 注意：此检查优先级最高，无需查询数据库
      if (phone === 'home_super_admin') {
        req.user = { role: 'super_admin', openid: 'home_super_admin', phone: 'home_super_admin', isHomeAdmin: true };
        console.log('✅ 权限验证通过 - 默认超级管理员手机号');
        return next();
      }
      
      // 【特殊】system_super_admin 是系统内置超级管理员（无需绑定手机号）
      if (openid === 'system_super_admin') {
        req.user = { role: 'super_admin', openid: 'system_super_admin', phone: 'system' };
        return next();
      }
      
      if (!openid) {
        console.log('❌ 权限验证失败 - 缺少 openid');
        return res.status(401).json({ 
          code: 1, 
          message: '未授权，缺少 openid' 
        });
      }
      
      // 查询用户信息
      const user = await User.findOne({ where: { openid } });
      
      if (!user) {
        return res.status(404).json({ 
          code: 1, 
          message: '用户不存在' 
        });
      }
      
      // 检查角色权限
      if (!allowedRoles.includes(user.role)) {
        console.log(`❌ 权限验证失败 - 用户角色不匹配：期望 ${allowedRoles.join(', ')}, 实际 ${user.role}`);
        return res.status(403).json({ 
          code: 1, 
          message: '权限不足' 
        });
      }
      
      // 【手机号改造】检查是否已绑定手机号（普通用户必须绑定）
      // 注意：排除绑定 API 本身，否则无法绑定
      const skipPhoneCheckPaths = ['/api/bind-phone', '/api/bind-user-info'];
      const shouldSkipPhoneCheck = skipPhoneCheckPaths.some(path => 
        req.path === path || req.originalUrl?.includes(path)
      );
      
      if (!user.phone && !shouldSkipPhoneCheck) {
        return res.status(403).json({ 
          code: 1, 
          message: '请先绑定手机号',
          needBindPhone: true 
        });
      }
      
      console.log(`✅ 权限验证通过 - 用户角色：${user.role}, 允许角色：${allowedRoles.join(', ')}`);
      
      // 【手机号改造】将 openid 和 phone 都附加到请求对象
      req.user = {
        openid: user.openid,
        phone: user.phone,  // 新增：业务层使用 phone
        role: user.role,
        name: user.name,
      };
      next();
      
    } catch (error) {
      console.error('权限验证失败:', error);
      res.status(500).json({ 
        code: -1, 
        message: '权限验证失败' 
      });
    }
  };
}

// 角色级别验证
function requireRoleLevel(minLevel) {
  return async (req, res, next) => {
    try {
      // 优先级：header > query > body
      const openid = req.headers['x-openid'] || req.query.openid || req.body.openid;
      
      if (!openid) {
        return res.status(401).json({ code: 1, message: '未授权' });
      }
      
      const user = await User.findOne({ where: { openid } });
      
      if (!user || ROLE_LEVEL[user.role] < minLevel) {
        return res.status(403).json({ code: 1, message: '权限不足' });
      }
      
      req.user = user;
      next();
      
    } catch (error) {
      console.error('权限验证失败:', error);
      res.status(500).json({ code: -1, message: '权限验证失败' });
    }
  };
}

module.exports = {
  requireRole,
  requireRoleLevel,
  ROLE_LEVEL
};
