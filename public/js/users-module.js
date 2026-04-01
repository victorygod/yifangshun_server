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

      _dependencies.showToast('保存成功', 'success');
      _dependencies.setEditingRowId?.(null);
      _dependencies.clearSelectedIds?.();
      _dependencies.loadTableData();
      _dependencies.loadStats();
      return res;
    } catch (err) {
      _dependencies.showToast('保存失败: ' + err.message, 'error');
      throw err;
    }
  },

  /**
   * 保存新增行（用户管理不支持新增）
   */
  onSaveNew: async () => {
    _dependencies.showToast('用户管理不支持新增', 'error');
    return;
  },

  /**
   * 删除行
   */
  onDelete: async (rowId) => {
    return new Promise((resolve, reject) => {
      _dependencies.showConfirm('确认删除', '确定要删除这个用户吗？', async () => {
        try {
          const res = await deleteUser(rowId);
          if (res.code !== 0) throw new Error(res.message);

          _dependencies.showToast('删除成功', 'success');
          _dependencies.setEditingRowId?.(null);
          _dependencies.clearSelectedIds?.();
          _dependencies.loadTableData();
          _dependencies.loadStats();
          resolve(res);
        } catch (err) {
          _dependencies.showToast('删除失败: ' + err.message, 'error');
          reject(err);
        }
      });
    });
  },

  /**
   * 批量删除
   */
  onBatchDelete: async (ids) => {
    const confirmMessage = `确定要删除选中的 ${ids.length} 个用户吗？`;

    return new Promise((resolve, reject) => {
      _dependencies.showConfirm('批量删除', confirmMessage, async () => {
        try {
          let deletedCount = 0;
          for (const id of ids) {
            const res = await deleteUser(id);
            if (res.code === 0) {
              deletedCount++;
            } else {
              throw new Error(`删除用户失败: ${res.message}`);
            }
          }
          _dependencies.showToast(`成功删除 ${deletedCount} 条记录`, 'success');
          _dependencies.clearSelectedIds?.();
          _dependencies.loadTableData();
          _dependencies.loadStats();
          resolve({ success: true, deletedCount });
        } catch (err) {
          _dependencies.showToast('批量删除失败: ' + err.message, 'error');
          _dependencies.loadTableData();
          reject(err);
        }
      });
    });
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