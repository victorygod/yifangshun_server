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
      // 从请求中获取openid
      const openid = req.body.openid || req.query.openid || req.headers['x-openid'];
      const isHomePage = req.headers['x-home-page'] === 'true'; // 标识是否为主页请求
      
      console.log('========================================');
      console.log('权限验证中间件');
      console.log('openid:', openid);
      console.log('isHomePage:', isHomePage);
      console.log('allowedRoles:', allowedRoles);
      console.log('========================================');
      
      // 主页请求（非微信环境），给予超级管理员权限
      // 注意：主页请求的优先级高于openid检查
      if (isHomePage) {
        req.user = { role: 'super_admin', openid: null, isHomePage: true };
        console.log('✅ 权限验证通过 - 主页请求，赋予超级管理员权限');
        return next();
      }
      
      if (!openid) {
        console.log('❌ 权限验证失败 - 缺少openid');
        return res.status(401).json({ 
          code: 1, 
          message: '未授权，缺少openid' 
        });
      }
      
      // 特殊处理：system_super_admin 是系统内置超级管理员
      if (openid === 'system_super_admin') {
        req.user = { role: 'super_admin', openid: 'system_super_admin' };
        return next();
      }
      
      // 查询用户信息
      const user = await User.findByPk(openid);
      
      if (!user) {
        return res.status(404).json({ 
          code: 1, 
          message: '用户不存在' 
        });
      }
      
      // 检查角色权限
      if (!allowedRoles.includes(user.role)) {
        console.log(`❌ 权限验证失败 - 用户角色不匹配: 期望 ${allowedRoles.join(', ')}, 实际 ${user.role}`);
        return res.status(403).json({ 
          code: 1, 
          message: '权限不足' 
        });
      }
      
      console.log(`✅ 权限验证通过 - 用户角色: ${user.role}, 允许角色: ${allowedRoles.join(', ')}`);
      
      // 将用户信息附加到请求对象
      req.user = user;
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
      const openid = req.body.openid || req.query.openid || req.headers['x-openid'];
      
      if (!openid) {
        return res.status(401).json({ code: 1, message: '未授权' });
      }
      
      const user = await User.findByPk(openid);
      
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

// 检查处方是否属于当前用户
function requireOwnership(prescriptionId) {
  return async (req, res, next) => {
    try {
      const prescription = await Prescription.findByPk(prescriptionId);
      
      if (!prescription) {
        return res.status(404).json({ code: 1, message: '处方不存在' });
      }
      
      // 超级管理员可以操作所有处方
      if (req.user.role === 'super_admin') {
        req.prescription = prescription;
        return next();
      }
      
      // 管理员只能操作自己上传的处方
      if (req.user.role === 'admin' && prescription.openid !== req.user.openid) {
        return res.status(403).json({ code: 1, message: '权限不足，只能操作自己上传的处方' });
      }
      
      // 普通用户只能操作自己的处方
      if (req.user.role === 'user' && prescription.openid !== req.user.openid) {
        return res.status(403).json({ code: 1, message: '权限不足' });
      }
      
      req.prescription = prescription;
      next();
      
    } catch (error) {
      console.error('归属验证失败:', error);
      res.status(500).json({ code: -1, message: '归属验证失败' });
    }
  };
}

// 检查处方状态是否为待审核
function requirePendingStatus(prescriptionId) {
  return async (req, res, next) => {
    try {
      const prescription = req.prescription || await Prescription.findByPk(prescriptionId);
      
      if (!prescription) {
        return res.status(404).json({ code: 1, message: '处方不存在' });
      }
      
      if (prescription.status !== '待审核') {
        return res.status(403).json({ code: 1, message: '只能删除待审核状态的处方' });
      }
      
      req.prescription = prescription;
      next();
      
    } catch (error) {
      console.error('状态验证失败:', error);
      res.status(500).json({ code: -1, message: '状态验证失败' });
    }
  };
}

module.exports = {
  requireRole,
  requireRoleLevel,
  requireOwnership,
  requirePendingStatus,
  ROLE_LEVEL
};