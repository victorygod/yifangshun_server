const { User } = require('./wrappers/db-wrapper');

/**
 * 测试辅助函数：设置用户为超级管理员
 * 注意：这个函数只应该在测试环境中使用
 */
async function setUserAsSuperAdmin(openid) {
  try {
    const user = await User.findByPk(openid);
    if (!user) {
      throw new Error('用户不存在');
    }

    await user.update({ role: 'super_admin' });
    return { code: 0, message: '已设置为超级管理员' };
  } catch (error) {
    console.error('设置超级管理员失败:', error);
    return { code: 1, message: error.message };
  }
}

module.exports = {
  setUserAsSuperAdmin
};