// ==================== 用户管理模块 ====================

/**
 * 依赖项（需要在使用前通过 initUsersModule 设置）
 */
const _dependencies = {
  getCurrentTable: null,
  getTableData: null,
  homeFetch: null,
  showToast: null,
  showConfirm: null,
  loadTableData: null,
  loadStats: null,
  getEditingRowId: null,
  setEditingRowId: null,
  clearSelectedIds: null
};

/**
 * 初始化用户管理模块
 * @param {Object} dependencies - 依赖项对象
 */
export function initUsersModule(dependencies) {
  Object.assign(_dependencies, dependencies);
}

/**
 * 保存用户
 * @param {string} rowId - 用户ID
 * @param {Object} data - 用户数据
 * @param {Object} originalRow - 原始行数据（包含openid）
 * @returns {Promise<Object>} 保存结果
 */
export async function saveUser(rowId, data, originalRow) {
  // 如果角色有变化，需要单独调用 set-role API
  if (data.role && data.role !== originalRow.role) {
    const roleRes = await _dependencies.homeFetch('/api/user/set-role', {
      method: 'POST',
      body: JSON.stringify({
        openid: originalRow.openid,
        role: data.role
      })
    });
    if (roleRes.code !== 0) throw new Error(roleRes.message);
  }

  // 更新其他字段（name, phone）
  const { name, phone } = data;
  if (name !== undefined || phone !== undefined) {
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;

    const res = await _dependencies.homeFetch(`/api/user/${originalRow.openid}`, {
      method: 'PUT',
      body: JSON.stringify(updateData)
    });
    return res;
  }

  // 没有其他字段需要更新
  return { code: 0, message: '保存成功' };
}

/**
 * 删除用户
 * @param {string} rowId - 用户ID
 * @returns {Promise<Object>} 删除结果
 */
export async function deleteUser(rowId) {
  const res = await _dependencies.homeFetch(`/api/user/${rowId}`, {
    method: 'DELETE'
  });
  return res;
}

/**
 * 加载用户列表数据
 * @param {number} page - 页码
 * @param {number} pageSize - 每页数量
 * @param {string} keyword - 搜索关键词
 * @returns {Promise<Object>} { data: Array, pagination: Object }
 */
export async function loadUsersData(page, pageSize, keyword) {
  const res = await _dependencies.homeFetch(`/api/home/users?page=${page}&pageSize=${pageSize}&keyword=${encodeURIComponent(keyword)}`);
  if (res.code !== 0) throw new Error(res.message);
  return {
    data: res.data?.rows || [],
    pagination: res.data?.pagination || {}
  };
}

/**
 * 用户模块的事件处理器（供 tableHandlers 使用）
 */
export const usersHandlers = {
  /**
   * 加载数据
   */
  onLoad: async (page, pageSize, keyword) => {
    return loadUsersData(page, pageSize, keyword);
  },

  /**
   * 保存行
   */
  onSave: async (rowId, rowElement, tableData) => {
    try {
      const inputs = rowElement.querySelectorAll('.cell-input, .cell-select');
      const data = {};
      inputs.forEach(input => {
        data[input.dataset.col] = input.value;
      });

      // 获取原始行数据（需要 openid）
      const originalRow = tableData.find(r => String(r.id) === String(rowId));
      if (!originalRow) {
        throw new Error('找不到用户数据');
      }

      const res = await saveUser(rowId, data, originalRow);
      if (res.code !== 0) throw new Error(res.message);

      // 退出编辑状态
      if (_dependencies.setEditingRowId) {
        _dependencies.setEditingRowId(null);
      }
      if (_dependencies.clearSelectedIds) {
        _dependencies.clearSelectedIds();
      }

      // 保存成功后刷新页面
      _dependencies.showToast('保存成功', 'success');
      _dependencies.loadTableData();
      _dependencies.loadStats();
      return res;
    } catch (err) {
      _dependencies.showToast('保存失败: ' + err.message, 'error');
      throw err;
    }
  },

  /**
   * 删除行
   */
  onDelete: async (rowId) => {
    try {
      const res = await deleteUser(rowId);
      if (res.code !== 0) throw new Error(res.message);

      // 退出编辑状态（如果删除的是正在编辑的行）
      if (_dependencies.getEditingRowId && _dependencies.setEditingRowId) {
        const currentEditingId = _dependencies.getEditingRowId();
        if (currentEditingId && String(currentEditingId) === String(rowId)) {
          _dependencies.setEditingRowId(null);
        }
      }
      if (_dependencies.clearSelectedIds) {
        _dependencies.clearSelectedIds();
      }

      // 删除成功后刷新页面
      _dependencies.showToast('删除成功', 'success');
      _dependencies.loadTableData();
      _dependencies.loadStats();
      return res;
    } catch (err) {
      _dependencies.showToast('删除失败: ' + err.message, 'error');
      throw err;
    }
  }
};

// ==================== 导出模块实例供全局访问 ====================
if (typeof window !== 'undefined') {
  window._usersModule = {
    initUsersModule,
    saveUser,
    deleteUser,
    loadUsersData,
    usersHandlers
  };
}