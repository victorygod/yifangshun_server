// ==================== 药材管理模块 ====================

/**
 * 依赖项（需要在使用前通过 initHerbsModule 设置）
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
 * 初始化药材管理模块
 * @param {Object} dependencies - 依赖项对象
 */
export function initHerbsModule(dependencies) {
  Object.assign(_dependencies, dependencies);
}

/**
 * 获取药材 API 路径
 * @param {string} action - 操作类型 (list, create, update, delete)
 * @param {string|number} id - 药材ID
 * @returns {string} API 路径
 */
export function getHerbApiPath(action, id) {
  const basePath = '/api/stock/herbs';
  switch (action) {
    case 'list':
      return basePath;
    case 'create':
      return basePath;
    case 'update':
      return `${basePath}/${id}`;
    case 'delete':
      return `${basePath}/${id}`;
    default:
      return basePath;
  }
}

/**
 * 保存药材（更新）
 * @param {string} rowId - 药材ID
 * @param {Object} data - 药材数据
 * @returns {Promise<Object>} 保存结果
 */
export async function saveHerb(rowId, data) {
  const res = await _dependencies.homeFetch(getHerbApiPath('update', rowId), {
    method: 'PUT',
    body: JSON.stringify(data)
  });
  return res;
}

/**
 * 删除药材
 * @param {string} rowId - 药材ID
 * @returns {Promise<Object>} 删除结果
 */
export async function deleteHerb(rowId) {
  const res = await _dependencies.homeFetch(getHerbApiPath('delete', rowId), {
    method: 'DELETE'
  });
  return res;
}

/**
 * 批量删除药材
 * @param {Array} ids - 药材ID数组
 * @returns {Promise<Object>} { success: boolean, deletedCount: number, error?: string }
 */
export async function deleteHerbsBatch(ids) {
  try {
    let deletedCount = 0;
    for (const id of ids) {
      const res = await _dependencies.homeFetch(getHerbApiPath('delete', id), { method: 'DELETE' });
      if (res.code === 0) {
        deletedCount++;
      }
    }
    return { success: true, deletedCount };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * 加载药材列表数据
 * @param {number} page - 页码
 * @param {number} pageSize - 每页数量
 * @param {string} keyword - 搜索关键词
 * @returns {Promise<Object>} { data: Array, pagination: Object }
 */
export async function loadHerbsData(page, pageSize, keyword) {
  const searchFields = ['name', 'alias', 'cabinetNo'];
  const searchFieldsParam = `&searchFields=${searchFields.join(',')}`;
  const res = await _dependencies.homeFetch(`${getHerbApiPath('list')}?page=${page}&pageSize=${pageSize}&keyword=${encodeURIComponent(keyword)}${searchFieldsParam}`);
  if (res.code !== 0) throw new Error(res.message);
  return {
    data: res.data?.rows || [],
    pagination: res.data?.pagination || {}
  };
}

/**
 * 药材模块的事件处理器（供 tableHandlers 使用）
 */
export const herbsHandlers = {
  /**
   * 加载数据
   */
  onLoad: async (page, pageSize, keyword) => {
    return loadHerbsData(page, pageSize, keyword);
  },

  /**
   * 保存行
   */
  onSave: async (rowId, rowElement) => {
    try {
      const inputs = rowElement.querySelectorAll('.cell-input, .cell-select');
      const data = {};
      inputs.forEach(input => {
        data[input.dataset.col] = input.value;
      });

      const res = await saveHerb(rowId, data);
      if (res.code !== 0) throw new Error(res.message);

      // 清除药材信息缓存
      if (window._stockModule) {
        window._stockModule.clearHerbInfoCache();
      }

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
   * 保存新增行
   */
  onSaveNew: async (rowElement) => {
    try {
      const inputs = rowElement.querySelectorAll('.cell-input, .cell-select');
      const data = {};
      inputs.forEach(input => {
        if (input.value.trim()) {
          data[input.dataset.col] = input.value.trim();
        }
      });

      if (Object.keys(data).length === 0) {
        _dependencies.showToast('请至少填写一个字段', 'error');
        return;
      }

      const res = await _dependencies.homeFetch(getHerbApiPath('create'), {
        method: 'POST',
        body: JSON.stringify(data)
      });

      if (res.code !== 0) throw new Error(res.message);

      // 清除药材信息缓存
      if (window._stockModule) {
        window._stockModule.clearHerbInfoCache();
      }

      _dependencies.showToast('新增成功', 'success');
      _dependencies.setEditingRowId?.(null);
      _dependencies.clearSelectedIds?.();
      _dependencies.loadTableData();
      _dependencies.loadStats();
      return res;
    } catch (err) {
      _dependencies.showToast('新增失败: ' + err.message, 'error');
      throw err;
    }
  },

  /**
   * 删除行
   */
  onDelete: async (rowId) => {
    return new Promise((resolve, reject) => {
      _dependencies.showConfirm('确认删除', '确定要删除这条药材吗？', async () => {
        try {
          const res = await deleteHerb(rowId);
          if (res.code !== 0) throw new Error(res.message);

          // 清除药材信息缓存
          if (window._stockModule) {
            window._stockModule.clearHerbInfoCache();
          }

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
    const confirmMessage = `确定要删除选中的 ${ids.length} 条药材吗？`;

    return new Promise((resolve, reject) => {
      _dependencies.showConfirm('批量删除', confirmMessage, async () => {
        try {
          let deletedCount = 0;
          for (const id of ids) {
            const res = await _dependencies.homeFetch(getHerbApiPath('delete', id), { method: 'DELETE' });
            if (res.code === 0) {
              deletedCount++;
            }
          }

          // 清除药材信息缓存
          if (window._stockModule) {
            window._stockModule.clearHerbInfoCache();
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
  window._herbsModule = {
    initHerbsModule,
    getHerbApiPath,
    saveHerb,
    deleteHerb,
    deleteHerbsBatch,
    loadHerbsData,
    herbsHandlers
  };
}